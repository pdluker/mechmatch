// core-effectiveness.js
//
// The Core wheel: 5 real cores in a consistent cycle (each beats exactly 2,
// loses to exactly 2), plus Resonant as a genuine sixth exception - it has
// no strong/weak matchups at all, and instead amplifies the PILOT's Sync
// multiplier in battle.js. That's deliberate: it's the one Core whose
// effectiveness is about the bond, not the machine, reinforcing the show's
// actual premise instead of being an arbitrary sixth wedge in the wheel.
//
// NOTE: Pass 1's brainstorm table listed each core as "strong vs 2, weak vs
// 2" but wasn't actually checked for symmetry (e.g. it had Thermal beating
// Kinetic without Kinetic losing to Thermal). Caught and fixed here, before
// any code depended on it - same category of bug as type-effectiveness.js's
// original inverted `weak` field, caught before anything read it.

export const CORE_CHART = {
  Thermal:  { strong: ['Kinetic', 'Voltaic'], weak: ['Cryo', 'Gravitic'] },
  Kinetic:  { strong: ['Voltaic', 'Cryo'],     weak: ['Thermal', 'Gravitic'] },
  Voltaic:  { strong: ['Cryo', 'Gravitic'],    weak: ['Thermal', 'Kinetic'] },
  Cryo:     { strong: ['Gravitic', 'Thermal'], weak: ['Kinetic', 'Voltaic'] },
  Gravitic: { strong: ['Thermal', 'Kinetic'],  weak: ['Voltaic', 'Cryo'] },
  Resonant: { strong: [], weak: [] } // amplifies Sync instead - see battle.js
};

const STRONG_MULT = 1.5;
const WEAK_MULT = 1 / 1.5;

export function coreEffectiveness(attackerCore, defenderCore) {
  const row = CORE_CHART[attackerCore];
  if (!row) return 1;
  if (row.strong.includes(defenderCore)) return STRONG_MULT;
  if (row.weak.includes(defenderCore)) return WEAK_MULT;
  return 1;
}

export function coreEffectivenessLabel(mult) {
  if (mult > 1) return 'favorable';
  if (mult < 1) return 'unfavorable';
  return 'neutral';
}
