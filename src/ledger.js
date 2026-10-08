// ledger.js
//
// The continuity ledger. Bible Section 5: "current roster, win/loss
// records, active rivalries, current arc number and day-within-arc, and
// injury/repair status per mech... worth designing as its own schema
// before writing generation code against it." This IS that schema, plus
// the mutation functions that keep it consistent. Pass 3 is this
// module's real spec - five mechanisms, each implemented below, each
// flagged with how concrete its spec actually is.
//
// Storage-agnostic by design, same separation chassis.js keeps from
// persistence and script.js's flavorState keeps from KV: this module
// only operates on a plain, JSON-serializable object. A real Worker
// loads/saves that object from KV (bible: "Same storage pattern -
// PODCAST_BUCKET KV, meaningfully larger payload") around these calls -
// this file doesn't know KV exists, same as script.js doesn't.
//
// Spec-confidence per mechanism (Pass 3's own section numbers):
//   1. Rivalry Graph       - CONCRETE: "exists the moment two pilots
//                             have fought twice... intensity is just a
//                             count." Implemented directly, no guessing.
//   2. Injury/grounding    - PARTLY CONCRETE: blowout->penalty->grounding
//                             shape is specified; exact durations/window
//                             sizes are not - ASSUMPTIONs below.
//   3. Chassis legacy      - SHAPE ONLY: "Legacy Resonance bonus scaled
//                             to accumulated win record" - no formula
//                             anywhere. First-draft formula, flagged.
//   4. War-weighted match  - SIGNAL ONLY: this module tracks faction
//                             standings and exposes a weight; the actual
//                             matchup SELECTION algorithm is index.js's
//                             job (not built yet - see PROJECT next
//                             step), kept separate on purpose.
//   5. Ripple events       - HEURISTIC: "well outside what the stat/sync
//                             gap predicted" - no formula given. Uses
//                             chassis BST gap vs. actual result as a
//                             first-pass proxy, flagged as approximate.

import { initialSyncRate, syncRateAfterWin } from './pilot.js';

// ---------------------------------------------------------------------
// Ledger creation
// ---------------------------------------------------------------------

export const LEDGER_SCHEMA_VERSION = 1;

/**
 * @param {object} opts
 * @param {number} [opts.arcLengthDays=75] - ASSUMPTION: bible says
 *   "4-6 arcs of roughly 60-90 days each" - 75 is a first-draft midpoint,
 *   tune once real episode cadence exists.
 */
export function createLedger({ arcLengthDays = 75 } = {}) {
  return {
    version: LEDGER_SCHEMA_VERSION,
    episodeCount: 0,
    roster: {},          // pilotId -> PilotRecord
    chassisRegistry: {},  // chassisId -> ChassisRecord
    rivalries: {},        // "pilotIdA|pilotIdB" (sorted) -> RivalryRecord
    factionStandings: {}, // factionName -> { wins, losses }
    matchHistory: [],     // capped MatchSummary[] - see MATCH_HISTORY_CAP
    arc: {
      number: 1,
      dayInArc: 0,
      arcLengthDays,
      // ASSUMPTION: offseason length. Bible: "a short offseason stretch
      // (2-3 episodes) for new pilot introductions." 3 chosen as the
      // upper end of that stated range, not derived from anything else.
      offseasonLengthDays: 3,
      phase: 'qualifying' // 'qualifying' | 'ascent' | 'reckoning' | 'finals' | 'offseason'
    }
  };
}

// ASSUMPTION: matchHistory is capped so a KV value doesn't grow
// unbounded over a 365-day run. 200 entries is a first-draft cap - a
// production version likely wants this in a separate KV list or D1
// table once the show has run long enough to matter; flagged here
// rather than silently deferred.
const MATCH_HISTORY_CAP = 200;

// ---------------------------------------------------------------------
// Roster management
// ---------------------------------------------------------------------

/**
 * Registers a new pilot/chassis pairing in the ledger. Call once per
 * pilot when they're introduced to the persistent roster (bible:
 * "~20-30 recurring pilot/mech pairs... with new pairs introduced
 * periodically").
 *
 * @param {object} opts
 * @param {string} opts.pilotId - caller-assigned stable id
 * @param {string} opts.name - display name
 * @param {string} opts.archetypeKey - key into pilot.js's PILOT_ARCHETYPES
 * @param {object} opts.chassis - output of chassis.js's generateChassis()
 * @param {string} opts.chassisId - caller-assigned stable id for this chassis
 */
export function addPilotToRoster(ledger, { pilotId, name, archetypeKey, chassis, chassisId }) {
  if (ledger.roster[pilotId]) {
    throw new Error(`addPilotToRoster: pilotId "${pilotId}" already exists`);
  }

  if (!ledger.chassisRegistry[chassisId]) {
    ledger.chassisRegistry[chassisId] = {
      id: chassisId,
      name: chassis.name,
      frame: chassis.frame,
      core: chassis.core,
      faction: chassis.faction,
      // BUG CAUGHT [2026-08-17]: this record originally stopped at bst -
      // it dropped chassis.stats and chassis.signatureWeapon entirely.
      // Without them, nothing downstream (index.js, battle.js) can
      // actually reconstruct a battle-ready chassis for a persistent
      // roster pilot - the registry looked complete but silently wasn't.
      // Caught before index.js was built against it, same category as
      // the episodeCount fix above.
      stats: { ...chassis.stats },
      signatureWeapon: chassis.signatureWeapon,
      bst: chassis.bst,
      totalWins: 0,
      pilotHistory: [], // [{ pilotId, winsWithChassis, lossesWithChassis }]
      currentPilotId: pilotId
    };
  }

  ledger.chassisRegistry[chassisId].pilotHistory.push({
    pilotId, winsWithChassis: 0, lossesWithChassis: 0
  });
  ledger.chassisRegistry[chassisId].currentPilotId = pilotId;

  ledger.roster[pilotId] = {
    id: pilotId,
    name,
    archetypeKey,
    chassisId,
    faction: chassis.faction,
    wins: 0,
    losses: 0,
    winsInSeat: 0, // wins piloting THIS chassis specifically - feeds pilot.js
    syncRate: initialSyncRate(archetypeKey, chassis.frame),
    status: 'active', // 'active' | 'grounded' | 'retired'
    groundedUntilEpisode: null,
    // Rolling window of recent LOSS margins only - feeds grounding check.
    // ASSUMPTION window size: last 3 losses considered "recent" for the
    // "twice within a short window" grounding rule.
    recentLossWindow: [],
    injuryPenaltyExpiresEpisode: null,
    beatenBy: { pilotIds: [], factions: [] } // feeds Vengeful's conditionalAttackBonus
  };

  if (!ledger.factionStandings[chassis.faction]) {
    ledger.factionStandings[chassis.faction] = { wins: 0, losses: 0 };
  }

  return ledger.roster[pilotId];
}

// ---------------------------------------------------------------------
// Vengeful lookup - "has this pilot lost to that pilot/faction before"
// ---------------------------------------------------------------------

/**
 * Feeds pilot.js's conditionalAttackBonus(). Checks both specific-pilot
 * and specific-faction history, per Pass 1's "+15 Attack specifically
 * against a pilot/faction that has beaten them before."
 */
export function hasLostTo(ledger, pilotId, opponentPilotId, opponentFaction) {
  const pilot = ledger.roster[pilotId];
  if (!pilot) return false;
  return (
    pilot.beatenBy.pilotIds.includes(opponentPilotId) ||
    pilot.beatenBy.factions.includes(opponentFaction)
  );
}

// ---------------------------------------------------------------------
// Rivalry Graph (Pass 3, Mechanism 1 - CONCRETE spec)
// ---------------------------------------------------------------------

function rivalryKey(pilotIdA, pilotIdB) {
  return [pilotIdA, pilotIdB].sort().join('|');
}

/**
 * "A rivalry EXISTS the moment two specific pilots have fought twice,
 * and its intensity is just a count." Read-only - the count itself is
 * maintained by recordMatchResult().
 */
export function getRivalry(ledger, pilotIdA, pilotIdB) {
  const key = rivalryKey(pilotIdA, pilotIdB);
  const record = ledger.rivalries[key];
  if (!record) return { meetings: 0, isRivalry: false };
  return { ...record, isRivalry: record.meetings >= 2 };
}

// ---------------------------------------------------------------------
// Recording a match result
// ---------------------------------------------------------------------

// ASSUMPTION: injury penalty duration. Bible: "applies a small,
// temporary stat penalty... for its next 1-2 appearances." 2 chosen as
// the stated upper bound.
const INJURY_PENALTY_APPEARANCES = 2;
// ASSUMPTION: injury penalty magnitude - bible says "small," no number.
// Modeled as a flat percentage reduction, same shape as Reluctant
// Successor's percent-based stats in pilot.js for consistency.
export const INJURY_PENALTY_PERCENT = 0.92; // -8%

// ASSUMPTION: grounding trigger. Bible: "loses badly enough, twice,
// within a short window." "Twice" is canon; "short window" is not
// sized anywhere - 3 most recent losses chosen as the window.
const GROUNDING_BLOWOUT_LOSSES_REQUIRED = 2;
const GROUNDING_WINDOW_SIZE = 3;
// ASSUMPTION: re-entry duration. Bible: "after a set number of
// episodes, or after another pilot vouches for them." The episode-based
// path is what's automatable here; vouching is exposed as a manual
// override (see reinstatePilot()) since it's a narrative/showrunner
// decision, not something derivable from match data.
const GROUNDING_REENTRY_EPISODES = 5;

/**
 * Records one battle.js simulateBattle() result into the ledger:
 * win/loss, sync rate growth, rivalry graph, injury persistence,
 * grounding, chassis win record, faction standings, and Vengeful's
 * beatenBy lookup table. Call once per episode, right after narration.
 *
 * @param {object} ledger
 * @param {object} result - battle.js's simulateBattle() return value
 * @param {string} winnerPilotId
 * @param {string} loserPilotId
 */
export function recordMatchResult(ledger, result, winnerPilotId, loserPilotId) {
  const episode = ledger.episodeCount;
  const winner = ledger.roster[winnerPilotId];
  const loser = ledger.roster[loserPilotId];
  if (!winner || !loser) {
    throw new Error('recordMatchResult: unknown pilotId');
  }

  // --- Win/loss + sync growth ---
  winner.wins += 1;
  winner.winsInSeat += 1;
  winner.syncRate = syncRateAfterWin(winner.syncRate);
  loser.losses += 1;
  // Bible only specifies sync "climbs with wins" - no stated penalty
  // for a loss, so loser.syncRate is deliberately left unchanged.

  // --- Vengeful lookup table ---
  if (!loser.beatenBy.pilotIds.includes(winnerPilotId)) {
    loser.beatenBy.pilotIds.push(winnerPilotId);
  }
  if (!loser.beatenBy.factions.includes(winner.faction)) {
    loser.beatenBy.factions.push(winner.faction);
  }

  // --- Rivalry Graph ---
  const key = rivalryKey(winnerPilotId, loserPilotId);
  if (!ledger.rivalries[key]) {
    ledger.rivalries[key] = { pilotIdA: winnerPilotId, pilotIdB: loserPilotId, meetings: 0, lastWinnerId: null };
  }
  ledger.rivalries[key].meetings += 1;
  ledger.rivalries[key].lastWinnerId = winnerPilotId;

  // --- Injury persistence + grounding (Pass 3, Mechanism 2) ---
  loser.recentLossWindow.push({ episode, blowout: !!result.blowout });
  while (loser.recentLossWindow.length > GROUNDING_WINDOW_SIZE) loser.recentLossWindow.shift();

  if (result.blowout) {
    loser.injuryPenaltyExpiresEpisode = episode + INJURY_PENALTY_APPEARANCES;

    const recentBlowouts = loser.recentLossWindow.filter((l) => l.blowout).length;
    if (recentBlowouts >= GROUNDING_BLOWOUT_LOSSES_REQUIRED && loser.status === 'active') {
      loser.status = 'grounded';
      loser.groundedUntilEpisode = episode + GROUNDING_REENTRY_EPISODES;
    }
  }

  // --- Chassis win record (feeds Legacy Resonance later) ---
  const winnerChassis = ledger.chassisRegistry[winner.chassisId];
  if (winnerChassis) {
    winnerChassis.totalWins += 1;
    const entry = winnerChassis.pilotHistory.find((p) => p.pilotId === winnerPilotId);
    if (entry) entry.winsWithChassis += 1;
  }
  const loserChassis = ledger.chassisRegistry[loser.chassisId];
  if (loserChassis) {
    const entry = loserChassis.pilotHistory.find((p) => p.pilotId === loserPilotId);
    if (entry) entry.lossesWithChassis += 1;
  }

  // --- Faction standings (feeds war-weighted matchmaking signal) ---
  ledger.factionStandings[winner.faction].wins += 1;
  ledger.factionStandings[loser.faction].losses += 1;

  // --- Match history + ripple detection ---
  const ripple = detectRipple(winnerChassis, loserChassis, result);
  ledger.matchHistory.push({
    episode,
    winnerPilotId,
    loserPilotId,
    blowout: !!result.blowout,
    narrowWin: !!result.narrowWin,
    decisiveFactor: result.decisiveFactor,
    ripple
  });
  while (ledger.matchHistory.length > MATCH_HISTORY_CAP) ledger.matchHistory.shift();

  // NOTE: episodeCount itself is advanced by advanceEpisode(), not here.
  // recordMatchResult() only reads the CURRENT episode to tag data with -
  // it must not own the counter, or a grounded pilot (who by definition
  // has no match to record) could never accumulate the days needed to
  // hit their groundedUntilEpisode re-entry check. Calling convention:
  // recordMatchResult() for today's match(es), then advanceEpisode()
  // once to close out the day - same order as this file's own tests.

  return { ripple };
}

/**
 * Manual override for the "vouch" re-entry path Pass 3 describes -
 * not derivable from match data, so it's a separate explicit call
 * rather than something recordMatchResult() infers.
 */
export function reinstatePilot(ledger, pilotId, { vouchedBy = null } = {}) {
  const pilot = ledger.roster[pilotId];
  if (!pilot || pilot.status !== 'grounded') return false;
  pilot.status = 'active';
  pilot.groundedUntilEpisode = null;
  return true;
}

// ---------------------------------------------------------------------
// Injury penalty application (paired with pilot.js's applyFlatModifiers)
// ---------------------------------------------------------------------

/**
 * Applies the temporary "still favoring that arm" penalty on top of
 * whatever pilot.js's pilotedStats() already produced. Kept as a
 * separate pass, same reasoning chassis.js/pilot.js/moves.js already
 * follow - the ledger doesn't need battle.js to know it exists, and
 * battle.js doesn't need to know injury tracking exists.
 */
export function applyInjuryPenalty(stats, ledger, pilotId) {
  const pilot = ledger.roster[pilotId];
  if (!pilot || pilot.injuryPenaltyExpiresEpisode == null) return { ...stats };
  if (ledger.episodeCount > pilot.injuryPenaltyExpiresEpisode) return { ...stats };

  const result = {};
  for (const [stat, value] of Object.entries(stats)) {
    result[stat] = Math.max(1, Math.round(value * INJURY_PENALTY_PERCENT));
  }
  return result;
}

// ---------------------------------------------------------------------
// Chassis legacy (Pass 3, Mechanism 3 - SHAPE ONLY, no formula given)
// ---------------------------------------------------------------------

// ASSUMPTION: no formula exists anywhere in the docs for how big a
// "Legacy Resonance" bonus should be. Modeled as a bonus to STARTING
// Sync Rate (reuses pilot.js's 0-100 scale rather than inventing a new
// one), scaled by the chassis's total accumulated wins, capped so an
// extremely decorated chassis doesn't hand a rookie a free full-sync
// start - that would undercut the "has to earn into it" framing Pass 1
// uses for Reluctant Successor and should apply here too.
const LEGACY_RESONANCE_PER_WIN = 0.5;
const LEGACY_RESONANCE_CAP = 20;

export function computeLegacyResonanceBonus(ledger, chassisId) {
  const chassis = ledger.chassisRegistry[chassisId];
  if (!chassis) return 0;
  return Math.min(LEGACY_RESONANCE_CAP, Math.round(chassis.totalWins * LEGACY_RESONANCE_PER_WIN));
}

/**
 * Retires a pilot and frees their chassis for reassignment. Returns the
 * freed chassisId and the Legacy Resonance bonus a new rookie inheriting
 * it should get - assigning the actual rookie is the caller's job
 * (likely index.js's roster-selection logic, not yet built), same
 * separation as everywhere else in this module.
 */
export function retirePilot(ledger, pilotId) {
  const pilot = ledger.roster[pilotId];
  if (!pilot) return null;
  pilot.status = 'retired';

  const chassis = ledger.chassisRegistry[pilot.chassisId];
  if (chassis) chassis.currentPilotId = null;

  return {
    chassisId: pilot.chassisId,
    legacyResonanceBonus: computeLegacyResonanceBonus(ledger, pilot.chassisId)
  };
}

/**
 * Registers a rookie pilot inheriting a chassis freed by retirePilot(),
 * applying the Legacy Resonance bonus to their starting Sync Rate.
 */
export function assignRookieToChassis(ledger, { pilotId, name, archetypeKey, chassisId }) {
  const chassis = ledger.chassisRegistry[chassisId];
  if (!chassis) throw new Error(`assignRookieToChassis: unknown chassisId "${chassisId}"`);
  if (chassis.currentPilotId) {
    throw new Error(`assignRookieToChassis: chassisId "${chassisId}" is still piloted`);
  }

  const bonus = computeLegacyResonanceBonus(ledger, chassisId);
  const baseSync = initialSyncRate(archetypeKey, chassis.frame);

  chassis.pilotHistory.push({ pilotId, winsWithChassis: 0, lossesWithChassis: 0 });
  chassis.currentPilotId = pilotId;

  ledger.roster[pilotId] = {
    id: pilotId,
    name,
    archetypeKey,
    chassisId,
    faction: chassis.faction,
    wins: 0,
    losses: 0,
    winsInSeat: 0,
    syncRate: Math.min(100, baseSync + bonus),
    status: 'active',
    groundedUntilEpisode: null,
    recentLossWindow: [],
    injuryPenaltyExpiresEpisode: null,
    beatenBy: { pilotIds: [], factions: [] }
  };

  return { pilotId, legacyResonanceBonus: bonus, startingSync: ledger.roster[pilotId].syncRate };
}

// ---------------------------------------------------------------------
// War-weighted matchmaking signal (Pass 3, Mechanism 4 - SIGNAL ONLY)
// ---------------------------------------------------------------------

/**
 * Returns a matchmaking weight multiplier for a faction, per Pass 3:
 * "factions currently behind... weighted TOWARD higher-stakes
 * matchups." This is the SIGNAL index.js's future matchup-selection
 * logic would consume - it does not select matchups itself, same
 * separation the bible draws between the ledger and generateMatchedPair.
 *
 * ASSUMPTION: weight formula. No formula given anywhere - modeled as
 * proportional to how far behind a faction's win rate is from the
 * field average, clamped to a sane range so one bad week doesn't spike
 * a faction's odds absurdly.
 */
export function getFactionWarWeight(ledger) {
  const factions = Object.entries(ledger.factionStandings);
  if (factions.length === 0) return {};

  const winRates = factions.map(([name, s]) => {
    const total = s.wins + s.losses;
    return [name, total > 0 ? s.wins / total : 0.5];
  });

  const avgWinRate = winRates.reduce((sum, [, wr]) => sum + wr, 0) / winRates.length;

  const weights = {};
  for (const [name, wr] of winRates) {
    // Behind-average factions get weight > 1; ahead-average get < 1.
    // Clamped to [0.5, 2.0] - deliberately bounded, same "clear rule,
    // not a simulation" spirit as the archetype table.
    const raw = 1 + (avgWinRate - wr) * 2;
    weights[name] = Math.max(0.5, Math.min(2.0, raw));
  }
  return weights;
}

// ---------------------------------------------------------------------
// Ripple events (Pass 3, Mechanism 5 - HEURISTIC, no formula given)
// ---------------------------------------------------------------------

// ASSUMPTION: "well outside what the stat/sync gap predicted" has no
// stated formula. Proxied here as: the winner's chassis had a
// meaningfully lower BST than the loser's, AND the win wasn't a fluke
// narrow win (a real underdog win should look convincing, not squeaked
// out) - a rough first pass, worth revisiting once decisiveFactor data
// exists across enough real episodes to see what upsets actually look like.
const RIPPLE_BST_GAP_THRESHOLD = 25;

function detectRipple(winnerChassis, loserChassis, result) {
  if (!winnerChassis || !loserChassis) return false;
  if (result.narrowWin) return false; // a squeaker isn't a statement upset
  const bstGap = loserChassis.bst - winnerChassis.bst;
  return bstGap >= RIPPLE_BST_GAP_THRESHOLD;
}

export function getRecentRipples(ledger, n = 5) {
  return ledger.matchHistory.filter((m) => m.ripple).slice(-n);
}

// ---------------------------------------------------------------------
// Arc / day tracking
// ---------------------------------------------------------------------

/**
 * Advances the ledger by one episode's worth of calendar time. Call
 * once per day, independent of whether a grounded pilot's episode
 * happens to feature them - this just moves the season clock and
 * checks re-entry eligibility.
 */
export function advanceEpisode(ledger) {
  ledger.episodeCount += 1;
  ledger.arc.dayInArc += 1;

  const episode = ledger.episodeCount;
  for (const pilot of Object.values(ledger.roster)) {
    if (pilot.status === 'grounded' && pilot.groundedUntilEpisode != null && episode >= pilot.groundedUntilEpisode) {
      pilot.status = 'active';
      pilot.groundedUntilEpisode = null;
    }
  }

  const totalDays = ledger.arc.phase === 'offseason'
    ? ledger.arc.offseasonLengthDays
    : ledger.arc.arcLengthDays;

  if (ledger.arc.dayInArc >= totalDays) {
    ledger.arc.dayInArc = 0;
    if (ledger.arc.phase === 'offseason') {
      ledger.arc.number += 1;
      ledger.arc.phase = 'qualifying';
    } else {
      ledger.arc.phase = 'offseason';
    }
  }

  return ledger.arc;
}

// ---------------------------------------------------------------------
// Serialization (explicit, not just raw JSON.stringify, so the KV
// boundary is a real function call site - same reasoning script.js's
// flavorState keeps as a plain object rather than a class instance)
// ---------------------------------------------------------------------

export function serializeLedger(ledger) {
  return JSON.stringify(ledger);
}

export function deserializeLedger(json) {
  const ledger = JSON.parse(json);
  if (ledger.version !== LEDGER_SCHEMA_VERSION) {
    // Loud, not silent - a schema migration path can hang off this
    // check once the schema actually changes once.
    throw new Error(`deserializeLedger: schema version mismatch (got ${ledger.version}, expected ${LEDGER_SCHEMA_VERSION})`);
  }
  return ledger;
}
