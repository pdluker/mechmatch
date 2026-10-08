// index.js
//
// The daily entrypoint. Bible Section 7: "index.js matchmaking - extended,
// not replaced - BST-banding becomes chassis-power-banding, plus the new
// persistent-roster selection logic." This is the module a Worker's cron
// trigger actually calls once per day - it owns MATCHMAKING (who fights)
// and ORCHESTRATION (wiring ledger -> battle -> narration -> ledger back
// together), and nothing else. It doesn't know about KV, R2, or Supabase;
// same separation every other module in this project keeps from storage.
//
// What this file does NOT do, on purpose:
//   - Force rivalry rematches. Pass 3, Mechanism 1 is explicit: "No
//     rivalry is ever declared by the showrunner... some rivalries will
//     matter and some won't, exactly like real sports." Deliberately
//     biasing matchmaking toward repeat pairings would manufacture the
//     exact thing Pass 3 says makes real rivalries feel real. Rivalries
//     emerge from the pigeonhole effect of a small persistent roster,
//     not from this module steering toward them.
//   - Retire pilots or introduce rookies automatically. ledger.js already
//     has retirePilot()/assignRookieToChassis() for that; wiring a real
//     automatic trigger for it is a further increment, not built here.

import { generateChassis, BST_BANDS } from './chassis.js';
import { buildFighter, simulateBattle } from './battle.js';
import { narrateBattle, createFlavorState } from './script.js';
import { selectArena } from './arenas.js';
import {
  hasLostTo,
  applyInjuryPenalty,
  getFactionWarWeight,
  recordMatchResult,
  advanceEpisode,
  addPilotToRoster
} from './ledger.js';

// ---------------------------------------------------------------------
// Reconstructing a battle-ready chassis from the ledger
// ---------------------------------------------------------------------

/**
 * ledger.chassisRegistry entries carry everything battle.js/moves.js
 * need (stats + signatureWeapon, fixed in ledger.js on 2026-08-17) but
 * in the registry's own shape, not chassis.js's generateChassis() shape.
 * This is the adapter between the two.
 */
function chassisFromRegistry(ledger, chassisId) {
  const record = ledger.chassisRegistry[chassisId];
  if (!record) throw new Error(`chassisFromRegistry: unknown chassisId "${chassisId}"`);
  return {
    name: record.name,
    frame: record.frame,
    core: record.core,
    signatureWeapon: record.signatureWeapon,
    faction: record.faction,
    stats: { ...record.stats },
    bst: record.bst
  };
}

// ---------------------------------------------------------------------
// Spotlight weighting - who gets featured today
// ---------------------------------------------------------------------

// ASSUMPTION: recency damping window and factor. No doc specifies a
// "don't repeat the same pilots constantly" rule explicitly, but without
// one, weighted selection over a small persistent roster will converge
// on whichever pilots happen to win the war-weight lottery early and
// keep featuring them. Same exclusion-window spirit as script.js's
// pickFlavor and chassis.js's pickKey, applied to pilot selection.
const RECENCY_WINDOW_EPISODES = 5;
const RECENCY_DAMPING_FACTOR = 0.3;

function wasRecentlyFeatured(ledger, pilotId) {
  const cutoff = ledger.episodeCount - RECENCY_WINDOW_EPISODES;
  return ledger.matchHistory.some(
    (m) => m.episode >= cutoff && (m.winnerPilotId === pilotId || m.loserPilotId === pilotId)
  );
}

/**
 * Combines Pass 3 Mechanism 4's war-weight signal (factions behind in
 * standings get featured more) with a recency damper (spread screen
 * time across the roster instead of converging on a few pilots).
 */
function computeSpotlightWeights(ledger, activePilotIds) {
  const warWeights = getFactionWarWeight(ledger);
  const weights = {};
  for (const pilotId of activePilotIds) {
    const pilot = ledger.roster[pilotId];
    let w = warWeights[pilot.faction] ?? 1;
    if (wasRecentlyFeatured(ledger, pilotId)) w *= RECENCY_DAMPING_FACTOR;
    weights[pilotId] = w;
  }
  return weights;
}

function weightedPick(ids, weights) {
  const total = ids.reduce((sum, id) => sum + weights[id], 0);
  if (total <= 0) return ids[Math.floor(Math.random() * ids.length)]; // fallback, never block
  let roll = Math.random() * total;
  for (const id of ids) {
    roll -= weights[id];
    if (roll <= 0) return id;
  }
  return ids[ids.length - 1]; // floating point safety
}

// ---------------------------------------------------------------------
// Matchmaking
// ---------------------------------------------------------------------

/**
 * Finds an opponent for pilotIdA using the same band-widening approach
 * as chassis.js's generateMatchedChassisPair (imported BST_BANDS - not
 * re-derived), applied to roster chassis power instead of freshly
 * generated chassis, plus the same spotlight weighting as pilot A's
 * selection so a behind-faction's "title defense" opponent isn't picked
 * uniformly at random either.
 */
function selectChallenger(ledger, pilotIdA, candidateIds) {
  const chassisA = ledger.chassisRegistry[ledger.roster[pilotIdA].chassisId];
  const weights = computeSpotlightWeights(ledger, candidateIds);

  for (const band of BST_BANDS) {
    const inBand = candidateIds.filter((id) => {
      const chassisB = ledger.chassisRegistry[ledger.roster[id].chassisId];
      return Math.abs(chassisB.bst - chassisA.bst) <= band;
    });
    if (inBand.length > 0) return weightedPick(inBand, weights);
  }

  // Fallback: never block a day's episode on finding a "fair" matchup.
  return weightedPick(candidateIds, weights);
}

/**
 * Selects today's two pilots from the active roster. Returns null if
 * fewer than 2 pilots are active (everyone else grounded/retired) - a
 * real, if unlikely, production edge case worth handling explicitly
 * rather than crashing the cron.
 */
export function selectDailyMatchup(ledger) {
  const activeIds = Object.values(ledger.roster)
    .filter((p) => p.status === 'active')
    .map((p) => p.id);

  if (activeIds.length < 2) return null;

  const spotlightWeights = computeSpotlightWeights(ledger, activeIds);
  const pilotIdA = weightedPick(activeIds, spotlightWeights);
  const remaining = activeIds.filter((id) => id !== pilotIdA);
  const pilotIdB = selectChallenger(ledger, pilotIdA, remaining);

  return { pilotIdA, pilotIdB };
}

// ---------------------------------------------------------------------
// Fighter construction from the ledger
// ---------------------------------------------------------------------

/**
 * Builds a battle.js Fighter for a persistent roster pilot: pulls their
 * real chassis (via the registry adapter above), their persisted Sync
 * Rate and winsInSeat, the Vengeful lookup, and applies any active
 * injury penalty on top - the one adjustment battle.js's buildFighter()
 * doesn't know about by design (it's ledger-agnostic).
 */
function buildFighterFromRoster(ledger, pilotId, opponentPilotId) {
  const pilot = ledger.roster[pilotId];
  const opponent = ledger.roster[opponentPilotId];
  const chassis = chassisFromRegistry(ledger, pilot.chassisId);

  const fighter = buildFighter({
    name: pilot.name,
    chassis,
    archetypeKey: pilot.archetypeKey,
    winsInSeat: pilot.winsInSeat,
    hasLostToOpponent: hasLostTo(ledger, pilotId, opponentPilotId, opponent.faction),
    syncRateOverride: pilot.syncRate
  });

  const adjustedStats = applyInjuryPenalty(fighter.stats, ledger, pilotId);
  fighter.stats = adjustedStats;
  fighter.maxHp = adjustedStats.hp;
  fighter.hp = adjustedStats.hp;

  return fighter;
}

// ---------------------------------------------------------------------
// Daily orchestration
// ---------------------------------------------------------------------

/**
 * Runs one full day: select -> build -> simulate -> narrate -> record ->
 * advance. This is the function a Worker's scheduled() handler calls.
 *
 * @param {object} ledger - from ledger.js's createLedger()/deserializeLedger()
 * @param {object} [flavorState] - script.js's exclusion-window state;
 *   persisted the same way the ledger is (own KV key, or folded into
 *   the ledger object - caller's choice, this function doesn't care)
 */
export function runDailyEpisode(ledger, flavorState = createFlavorState()) {
  const matchup = selectDailyMatchup(ledger);
  if (!matchup) {
    return { ok: false, reason: 'insufficient-active-pilots', activeCount: Object.values(ledger.roster).filter(p => p.status === 'active').length };
  }

  const fighterA = buildFighterFromRoster(ledger, matchup.pilotIdA, matchup.pilotIdB);
  const fighterB = buildFighterFromRoster(ledger, matchup.pilotIdB, matchup.pilotIdA);

  const result = simulateBattle(fighterA, fighterB);

  // Defensive: don't trust name-matching alone to identify the winner -
  // display names are assumed unique but never guaranteed. hp is ground
  // truth, since battle.js mutates these exact fighter objects in place.
  const winnerIsA = result.winner === fighterA.name;
  const winnerIsAByHp = result.timedOut
    ? fighterA.hp >= fighterB.hp   // battle.js's own tie-break rule on timeout
    : fighterA.hp > 0;             // otherwise exactly one fighter is at 0
  if (winnerIsA !== winnerIsAByHp) {
    throw new Error(
      `runDailyEpisode: winner name/hp mismatch (${fighterA.name} vs ${fighterB.name}) - ` +
      `likely duplicate display names in the roster, fix pilot names before trusting results`
    );
  }
  const winnerPilotId = winnerIsA ? matchup.pilotIdA : matchup.pilotIdB;
  const loserPilotId = winnerIsA ? matchup.pilotIdB : matchup.pilotIdA;

  const { ripple } = recordMatchResult(ledger, result, winnerPilotId, loserPilotId);

  // NEW 2026-08-18: narration now fires AFTER recordMatchResult (moved
  // down from right after simulateBattle) specifically so it can read
  // real rivalry-meeting counts and ripple status - script.js's stakes/
  // rivalry/ripple lines were built to accept this context but had
  // nothing feeding them until now. rivalryKey mirrors ledger.js's own
  // internal key format (sorted pilot ids, joined with '|') rather than
  // exporting that function just for this one read.
  const rivalryKey = [winnerPilotId, loserPilotId].sort().join('|');
  const arena = selectArena(fighterA.faction, fighterB.faction);
  const context = {
    rivalryMeetings: ledger.rivalries[rivalryKey]?.meetings,
    ripple,
    arena
  };
  const narration = narrateBattle(result, fighterA, fighterB, flavorState, context);

  const arc = advanceEpisode(ledger);

  // NEW 2026-08-18: chassisSummary lets worker.js generate per-episode
  // artwork (artwork.js) without re-deriving chassis data from the
  // ledger a second time - this is the same chassisFromRegistry() lookup
  // buildFighterFromRoster already did internally, just also returned
  // here since art generation happens outside this module.
  const chassisSummary = {
    a: chassisFromRegistry(ledger, ledger.roster[matchup.pilotIdA].chassisId),
    b: chassisFromRegistry(ledger, ledger.roster[matchup.pilotIdB].chassisId)
  };

  return {
    ok: true,
    episode: ledger.episodeCount - 1, // the episode just recorded, pre-advance value
    matchup,
    winnerPilotId,
    loserPilotId,
    result,
    narration,
    ripple,
    arc,
    chassisSummary,
    arena
  };
}

// ---------------------------------------------------------------------
// Roster seeding helper (for tests/demos - production roster content is
// a separate, larger content-writing task, not something to invent here)
// ---------------------------------------------------------------------

/**
 * Convenience wrapper: generates a fresh chassis and registers a pilot
 * on it in one call. Real roster seeding (~20-30 named pilots) is a
 * content task, not a code task - this just removes boilerplate for
 * tests and small demo rosters.
 */
export function seedPilot(ledger, { pilotId, name, archetypeKey, chassisId }) {
  const chassis = generateChassis();
  return addPilotToRoster(ledger, { pilotId, name, archetypeKey, chassis, chassisId });
}
