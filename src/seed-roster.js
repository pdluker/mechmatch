// seed-roster.js
//
// Roster content. REVISED 2026-08-19 with the named pilots from "THE
// CIRCUIT" reference doc's 8 Foundational battle groups (4 named pilots
// per faction: Veteran, Prodigy, Reluctant Successor, Independent -
// exactly the doc's stated archetypes, not invented here).
//
// KNOWN GAP, flagged rather than silently patched: this doc's roster
// only covers 4 of pilot.js's 6 implemented archetypes. Vengeful and
// True Believer pilots aren't named anywhere in the source doc, so
// those two archetypes - despite being fully implemented with real
// stat modifiers in pilot.js - have zero roster representation here
// and will never actually appear in a battle until someone either (a)
// names Vengeful/True Believer pilots for these factions, or (b)
// decides that's intentional for now. Not invented here since pilot
// names are a creative decision, not a mechanical one - see the
// decision list this was handed back with.
//
// Two entry points:
//   seedStarterRoster(ledger)   - fills an EMPTY ledger (fresh/test
//                                  environments). Throws if roster isn't
//                                  empty, same as before.
//   addMissingRosterPilots(ledger) - idempotent top-up for the ALREADY-
//                                  LIVE ledger, which has real episode
//                                  history and isn't empty. Only adds
//                                  pilots not already present. THIS is
//                                  the one that actually matters for
//                                  getting these 32 pilots into
//                                  production - seedStarterRoster alone
//                                  won't touch a non-empty ledger.

import { generateChassis } from './chassis.js';
import { addPilotToRoster } from './ledger.js';

// pilotId: kebab-case of the doc's name, matching the existing
// production naming convention (e.g. "bram-ashgrave", "wren-kite").
const ROSTER = [
  // Ashguard Combine - Foundry Belt
  { pilotId: 'mara-vey', name: 'Mara Vey', archetypeKey: 'Veteran', faction: 'Ashguard Combine' },
  { pilotId: 'tomas-rusk', name: 'Tomas Rusk', archetypeKey: 'Prodigy', faction: 'Ashguard Combine' },
  { pilotId: 'elian-forge', name: 'Elian Forge', archetypeKey: 'ReluctantSuccessor', faction: 'Ashguard Combine' },
  { pilotId: 'brin-calder', name: 'Brin Calder', archetypeKey: 'Independent', faction: 'Ashguard Combine' },

  // Skyline Concord - The High Reaches
  { pilotId: 'sera-vale', name: 'Sera Vale', archetypeKey: 'Veteran', faction: 'Skyline Concord' },
  { pilotId: 'kian-aer', name: 'Kian Aer', archetypeKey: 'Prodigy', faction: 'Skyline Concord' },
  { pilotId: 'neris-cael', name: 'Neris Cael', archetypeKey: 'ReluctantSuccessor', faction: 'Skyline Concord' },
  { pilotId: 'oren-pike', name: 'Oren Pike', archetypeKey: 'Independent', faction: 'Skyline Concord' },

  // Tidewrought Assembly - Salt Archipelago
  { pilotId: 'ilya-marr', name: 'Ilya Marr', archetypeKey: 'Veteran', faction: 'Tidewrought Assembly' },
  { pilotId: 'tavi-neris', name: 'Tavi Neris', archetypeKey: 'Prodigy', faction: 'Tidewrought Assembly' },
  { pilotId: 'corin-pell', name: 'Corin Pell', archetypeKey: 'ReluctantSuccessor', faction: 'Tidewrought Assembly' },
  { pilotId: 'vessa-quill', name: 'Vessa Quill', archetypeKey: 'Independent', faction: 'Tidewrought Assembly' },

  // Wraithline Circuit - Hollow Ruins
  { pilotId: 'vale-nox', name: 'Vale Nox', archetypeKey: 'Veteran', faction: 'Wraithline Circuit' },
  { pilotId: 'rian-voss', name: 'Rian Voss', archetypeKey: 'Prodigy', faction: 'Wraithline Circuit' },
  { pilotId: 'edda-mire', name: 'Edda Mire', archetypeKey: 'ReluctantSuccessor', faction: 'Wraithline Circuit' },
  { pilotId: 'kest-renn', name: 'Kest Renn', archetypeKey: 'Independent', faction: 'Wraithline Circuit' },

  // Ironroot Concord - Deep Canopy
  { pilotId: 'hara-moss', name: 'Hara Moss', archetypeKey: 'Veteran', faction: 'Ironroot Concord' },
  { pilotId: 'fen-alder', name: 'Fen Alder', archetypeKey: 'Prodigy', faction: 'Ironroot Concord' },
  { pilotId: 'lio-thorn', name: 'Lio Thorn', archetypeKey: 'ReluctantSuccessor', faction: 'Ironroot Concord' },
  { pilotId: 'rook-vale', name: 'Rook Vale', archetypeKey: 'Independent', faction: 'Ironroot Concord' },

  // Aurelian Accord - Aurel, the Capital
  { pilotId: 'lucien-ardent', name: 'Lucien Ardent', archetypeKey: 'Veteran', faction: 'Aurelian Accord' },
  { pilotId: 'celia-veyre', name: 'Celia Veyre', archetypeKey: 'Prodigy', faction: 'Aurelian Accord' },
  { pilotId: 'adrian-sol', name: 'Adrian Sol', archetypeKey: 'ReluctantSuccessor', faction: 'Aurelian Accord' },
  { pilotId: 'mira-bell', name: 'Mira Bell', archetypeKey: 'Independent', faction: 'Aurelian Accord' },

  // Static Vanguard - Volt Flats
  { pilotId: 'jax-renn', name: 'Jax Renn', archetypeKey: 'Veteran', faction: 'Static Vanguard' },
  { pilotId: 'nika-volt', name: 'Nika Volt', archetypeKey: 'Prodigy', faction: 'Static Vanguard' },
  { pilotId: 'aris-kade', name: 'Aris Kade', archetypeKey: 'ReluctantSuccessor', faction: 'Static Vanguard' },
  { pilotId: 'sol-marr', name: 'Sol Marr', archetypeKey: 'Independent', faction: 'Static Vanguard' },

  // Thornback Cartel - no fixed home / Bonefields
  { pilotId: 'ressa-thorn', name: 'Ressa Thorn', archetypeKey: 'Veteran', faction: 'Thornback Cartel' },
  { pilotId: 'pip-calder', name: 'Pip Calder', archetypeKey: 'Prodigy', faction: 'Thornback Cartel' },
  { pilotId: 'juno-rake', name: 'Juno Rake', archetypeKey: 'ReluctantSuccessor', faction: 'Thornback Cartel' },
  { pilotId: 'ash-venn', name: 'Ash Venn', archetypeKey: 'Independent', faction: 'Thornback Cartel' },

  // NEW 2026-08-19: 8 additional pilots, one per faction, covering
  // Vengeful and True Believer - the two archetypes pilot.js already
  // implements mechanically but that the source doc never named anyone
  // for. Split 4/4 across factions rather than 2 per faction (16 total)
  // per the explicit "8 more, one per faction" instruction. Names
  // invented here to match the doc's own established style, including
  // its own pattern of reusing surnames across different factions
  // (e.g. the doc itself uses "Voss" for both Wraithline's Rian Voss
  // and Meridian's Dorian Voss; "Marr" appears in three different
  // factions already).
  { pilotId: 'rurik-stane', name: 'Rurik Stane', archetypeKey: 'Vengeful', faction: 'Ashguard Combine' },
  { pilotId: 'dara-voss', name: 'Dara Voss', archetypeKey: 'Vengeful', faction: 'Tidewrought Assembly' },
  { pilotId: 'selene-ardis', name: 'Selene Ardis', archetypeKey: 'Vengeful', faction: 'Aurelian Accord' },
  { pilotId: 'coda-venn', name: 'Coda Venn', archetypeKey: 'Vengeful', faction: 'Thornback Cartel' },
  { pilotId: 'wren-astor', name: 'Wren Astor', archetypeKey: 'TrueBeliever', faction: 'Skyline Concord' },
  { pilotId: 'tamsin-ward', name: 'Tamsin Ward', archetypeKey: 'TrueBeliever', faction: 'Wraithline Circuit' },
  { pilotId: 'sage-birch', name: 'Sage Birch', archetypeKey: 'TrueBeliever', faction: 'Ironroot Concord' },
  { pilotId: 'zeph-rourke', name: 'Zeph Rourke', archetypeKey: 'TrueBeliever', faction: 'Static Vanguard' }
];

function buildPilotEntry(spec) {
  const chassis = generateChassis({ forceFaction: spec.faction });
  const chassisId = `c-${spec.pilotId}`;
  return { pilotId: spec.pilotId, name: spec.name, archetypeKey: spec.archetypeKey, chassis, chassisId };
}

/**
 * Fills a fresh, empty ledger. Throws if the roster isn't empty -
 * same contract as before, unchanged.
 */
export function seedStarterRoster(ledger) {
  if (Object.keys(ledger.roster).length > 0) {
    throw new Error('seedStarterRoster: ledger roster is not empty - use addMissingRosterPilots for a live ledger instead');
  }
  for (const spec of ROSTER) {
    const entry = buildPilotEntry(spec);
    addPilotToRoster(ledger, entry);
  }
  return ledger;
}

/**
 * Idempotent top-up for a ledger that already has history - only adds
 * pilots from ROSTER that aren't already present by pilotId. Safe to
 * call repeatedly (e.g. from an admin endpoint) without duplicating or
 * erroring on pilots already in the live roster.
 */
export function addMissingRosterPilots(ledger) {
  const added = [];
  for (const spec of ROSTER) {
    if (ledger.roster[spec.pilotId]) continue;
    const entry = buildPilotEntry(spec);
    addPilotToRoster(ledger, entry);
    added.push(spec.pilotId);
  }
  return added;
}

export { ROSTER };
