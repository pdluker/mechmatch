// moves.js
//
// Move data layer for chassis.js. Bible Section 4: "Each chassis has 3-4
// available moves (signature weapon + faction move(s) + a generic frame
// move). Move selection can start simple - weighted random, favoring the
// signature weapon."
//
// chassis.js deliberately only stores the signature weapon's NAME (a
// string) and doesn't touch balance numbers - keeping it "ports forward
// unchanged" per the bible's Section 6 table. All power/accuracy/weight
// data lives here instead, as a separate lookup layer, so chassis.js
// stays untouched.
//
// IMPORTANT: every power/accuracy number below is NEW - this project has
// no prior tuned move-balance data to port (pokepod's creatures.js used
// species-level move lists, not this vocabulary). Treat this whole file
// as a first draft, same posture as chassis.js's placeholder naming
// scheme: swap in real tuning once battle logs exist to tune against.

import { SIGNATURE_WEAPONS } from './chassis.js';

// Selection weight: signature weapon should come up most often per the
// bible ("weighted toward signature weapon"). Faction move(s) next,
// frame-generic move least common.
export const WEIGHT_SIGNATURE = 3;
export const WEIGHT_FACTION = 2;
export const WEIGHT_FRAME = 1;

// ---------------------------------------------------------------------
// Signature weapons - one entry per name in chassis.js's SIGNATURE_WEAPONS.
// power: base power (roughly 55-100 scale, tuned against battle.js's
// DAMAGE_SCALE - see battle.js's own ASSUMPTION note on that constant).
// accuracy: 0-1 hit chance. critBonus: added to the base crit chance.
// ---------------------------------------------------------------------
export const SIGNATURE_WEAPON_STATS = {
  'Lance Driver':          { power: 85, accuracy: 0.90, critBonus: 0.00 },
  'Fracture Cannon':       { power: 100, accuracy: 0.78, critBonus: 0.00 },
  'Twin Talons':           { power: 70, accuracy: 0.88, critBonus: 0.08 },
  'Aegis Slam':            { power: 82, accuracy: 0.90, critBonus: 0.00 },
  'Coil Whip':             { power: 68, accuracy: 0.95, critBonus: 0.00 },
  'Riftblade':             { power: 90, accuracy: 0.82, critBonus: 0.04 },
  'Anchor Chain':          { power: 75, accuracy: 0.90, critBonus: 0.00 },
  'Static Lash':           { power: 72, accuracy: 0.90, critBonus: 0.06 },
  'Gravity Well':          { power: 88, accuracy: 0.80, critBonus: 0.00 },
  'Ashfall Barrage':       { power: 95, accuracy: 0.78, critBonus: 0.00 },
  'Tidebreaker Harpoon':   { power: 92, accuracy: 0.82, critBonus: 0.00 },
  'Thornlash':             { power: 74, accuracy: 0.88, critBonus: 0.00 },
  'Sundial Edge':          { power: 80, accuracy: 0.90, critBonus: 0.06 },
  'Voltcage Net':          { power: 70, accuracy: 0.90, critBonus: 0.00 },
  'Cryo Spike Array':      { power: 84, accuracy: 0.84, critBonus: 0.00 }
};

// Sanity: every SIGNATURE_WEAPONS entry from chassis.js must have stats
// here (checked at load time so a missing entry fails loud, not silent).
for (const name of SIGNATURE_WEAPONS) {
  if (!SIGNATURE_WEAPON_STATS[name]) {
    throw new Error(`moves.js is missing stats for signature weapon "${name}"`);
  }
}

// ---------------------------------------------------------------------
// Frame moves - one generic, reliable move per Frame archetype, flavored
// to match the frame's fighting style (bible/Pass1 Section 3 frame table).
// ---------------------------------------------------------------------
export const FRAME_MOVES = {
  Vanguard:    { name: 'Forward Assault',  power: 78, accuracy: 0.90, critBonus: 0.00 },
  Bulwark:     { name: 'Shield Bash',      power: 70, accuracy: 0.92, critBonus: 0.00 },
  Interceptor: { name: 'Flanking Strike',  power: 68, accuracy: 0.92, critBonus: 0.05 },
  Siege:       { name: 'Siege Barrage',    power: 96, accuracy: 0.75, critBonus: 0.00 },
  Sentinel:    { name: 'Bulwark Counter',  power: 66, accuracy: 0.92, critBonus: 0.00 },
  Skirmisher:  { name: 'Hit and Run',      power: 60, accuracy: 0.95, critBonus: 0.06 },
  Ronin:       { name: 'Balanced Strike',  power: 74, accuracy: 0.90, critBonus: 0.00 },
  Colossus:    { name: 'Crushing Blow',    power: 105, accuracy: 0.72, critBonus: 0.00 }
};

// ---------------------------------------------------------------------
// Faction moves - one per faction (bible: "1-2 faction-specific moves").
// Kept to one each for now to keep the moveset at the bible's stated
// 3-4 total (signature + 1 faction + 1 frame); a second faction move can
// be added later as a real design pass, not implied by anything here.
// ---------------------------------------------------------------------
export const FACTION_MOVES = {
  'Ashguard Combine':     { name: 'Molten Overdrive',  power: 92, accuracy: 0.80, critBonus: 0.00 },
  'Skyline Concord':      { name: 'Diving Strike',     power: 80, accuracy: 0.90, critBonus: 0.04 },
  'Tidewrought Assembly': { name: 'Riptide Slam',      power: 76, accuracy: 0.90, critBonus: 0.00 },
  'Wraithline Circuit':   { name: 'Shadow Snap',       power: 70, accuracy: 0.94, critBonus: 0.10 },
  'Ironroot Concord':     { name: 'Root Lock',         power: 65, accuracy: 0.94, critBonus: 0.00 },
  'Aurelian Accord':      { name: 'Precision Thrust',  power: 76, accuracy: 0.96, critBonus: 0.08 },
  'Static Vanguard':      { name: 'Voltage Surge',     power: 82, accuracy: 0.88, critBonus: 0.03 },
  // Thornback Cartel: deliberately the wildcard (bible: "no shared
  // philosophy... patchwork chassis"). Mechanically wildcard too - power
  // rolls a wide random range each time instead of a fixed value.
  'Thornback Cartel':     { name: 'Scrap Storm', powerRange: [55, 105], accuracy: 0.85, critBonus: 0.02 }
};

/**
 * Resolves a faction move's power at call time (handles Thornback
 * Cartel's random-range wildcard vs everyone else's fixed power).
 */
function resolveFactionMovePower(move) {
  if (move.powerRange) {
    const [min, max] = move.powerRange;
    return Math.round(min + Math.random() * (max - min));
  }
  return move.power;
}

/**
 * Builds the 3-move set for a chassis: signature weapon, faction move,
 * frame move - each tagged with a selection weight. This is what
 * battle.js's pickMove() draws from.
 */
export function getMoveset(chassis) {
  const sig = SIGNATURE_WEAPON_STATS[chassis.signatureWeapon];
  const factionMove = FACTION_MOVES[chassis.faction];
  const frameMove = FRAME_MOVES[chassis.frame];

  return [
    { name: chassis.signatureWeapon, ...sig, weight: WEIGHT_SIGNATURE, source: 'signature' },
    {
      name: factionMove.name,
      power: resolveFactionMovePower(factionMove),
      accuracy: factionMove.accuracy,
      critBonus: factionMove.critBonus,
      weight: WEIGHT_FACTION,
      source: 'faction',
      // Thornback's power is re-rolled fresh each time this move is
      // actually thrown in battle - see battle.js's pickMove(), which
      // re-resolves powerRange moves at throw time, not at moveset build
      // time, so the wildcard stays a wildcard turn to turn.
      powerRange: factionMove.powerRange
    },
    { name: frameMove.name, ...frameMove, weight: WEIGHT_FRAME, source: 'frame' }
  ];
}

/**
 * Weighted-random move pick. Re-resolves Thornback's random-power move
 * at throw time (see comment above) so "Scrap Storm" rolls fresh every
 * time it's actually used, not once at moveset-build time.
 */
export function pickMove(moveset) {
  const totalWeight = moveset.reduce((sum, m) => sum + m.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const move of moveset) {
    roll -= move.weight;
    if (roll <= 0) {
      if (move.powerRange) {
        const [min, max] = move.powerRange;
        return { ...move, power: Math.round(min + Math.random() * (max - min)) };
      }
      return move;
    }
  }
  return moveset[moveset.length - 1]; // fallback, floating point safety
}
