// arenas.js
//
// NEW 2026-08-19. Was on the bible's roadmap since the original draft
// (Section 6: "arenas.js - ports forward almost unchanged - arenas
// don't care what's fighting in them") but never actually built for
// this project. This is that module, now with real content from two
// sources already established elsewhere in this project rather than
// invented fresh: the 8 factions' home-region atmosphere already
// described in image-prompt-starter-pack.md / battlearena boards, and
// the Neutral Circuit Arena + Bonefields from "THE CIRCUIT" doc.
//
// Kept battle-agnostic on purpose, same separation every other module
// here keeps: this file only knows arena names and flavor text. It
// doesn't touch stats, damage, or matchmaking - arena selection lives
// in index.js, same as everything else that orchestrates.

export const ARENAS = {
  'foundry-belt': {
    name: 'The Foundry Belt',
    homeFaction: 'Ashguard Combine',
    flavor: 'a vast industrial valley of blast furnaces and iron scaffolding, molten glow lighting a heavy haze of smoke',
    lesson: 'endure'
  },
  'high-reaches': {
    name: 'The High Reaches',
    homeFaction: 'Skyline Concord',
    flavor: 'a mountain ridge above the cloud line, thin cold air and jagged peaks catching the early light',
    lesson: 'control position'
  },
  'salt-archipelago': {
    name: 'The Salt Archipelago',
    homeFaction: 'Tidewrought Assembly',
    flavor: 'a scattering of low rocky islands connected by narrow causeways, shallow turquoise water and salt-crusted stone',
    lesson: 'adapt'
  },
  'hollow-ruins': {
    name: 'The Hollow Ruins',
    homeFaction: 'Wraithline Circuit',
    flavor: 'the crumbling remains of an ancient stone city half-swallowed by mist, broken archways and an eerie stillness',
    lesson: 'disappear and disrupt'
  },
  'deep-canopy': {
    name: 'The Deep Canopy',
    homeFaction: 'Ironroot Concord',
    flavor: 'a dense ancient forest with towering moss-covered trees, dappled green light through the canopy',
    lesson: 'outlast'
  },
  'aurel-capital': {
    name: 'Aurel, the Capital',
    homeFaction: 'Aurelian Accord',
    flavor: 'a grand formal dueling courtyard in a marble capital city, gold-trimmed architecture and banners overhead',
    lesson: 'perfect'
  },
  'volt-flats': {
    name: 'The Volt Flats',
    homeFaction: 'Static Vanguard',
    flavor: 'an open, perfectly flat plain under a storm-charged sky, distant heat lightning over cracked earth',
    lesson: 'move faster'
  },
  'bonefields': {
    name: 'The Bonefields',
    homeFaction: null, // Thornback Cartel's favored gathering ground, but not exclusive to them
    flavor: 'a field of enormous ancient fossil structures rising from the dust, shelter and salvage for anyone passing through',
    lesson: 'improvise'
  },
  'neutral-circuit': {
    name: 'the Neutral Circuit Arena',
    homeFaction: null,
    flavor: 'a large open-air dueling arena of weathered gray stone, banners of every faction hanging around its rim',
    lesson: null
  }
};

const HOME_ARENA_BY_FACTION = Object.fromEntries(
  Object.entries(ARENAS)
    .filter(([, arena]) => arena.homeFaction)
    .map(([id, arena]) => [arena.homeFaction, id])
);

// ASSUMPTION 2026-08-19: no doc specifies how often a match happens on
// home ground vs. neutral vs. wildcard territory - this distribution
// (weighted toward one fighter's home turf, with Bonefields as a real
// but less common wildcard) is a first-pass choice, easy to retune once
// real episodes can be reviewed against it, same posture as every other
// ASSUMPTION already in this project.
const HOME_ARENA_WEIGHT = 0.45;
const NEUTRAL_ARENA_WEIGHT = 0.4;
const BONEFIELDS_WEIGHT = 0.15;

/**
 * Picks today's arena given the two fighting factions. If both share a
 * faction, that faction's home ground always wins (no ambiguity to
 * weight). Otherwise weighted between one of the two combatants' home
 * turf, the Neutral Circuit Arena, or the Bonefields wildcard.
 */
export function selectArena(factionA, factionB) {
  if (factionA === factionB && HOME_ARENA_BY_FACTION[factionA]) {
    return ARENAS[HOME_ARENA_BY_FACTION[factionA]];
  }

  const roll = Math.random();
  if (roll < HOME_ARENA_WEIGHT) {
    const homeCandidates = [factionA, factionB]
      .map((f) => HOME_ARENA_BY_FACTION[f])
      .filter(Boolean);
    if (homeCandidates.length > 0) {
      const pick = homeCandidates[Math.floor(Math.random() * homeCandidates.length)];
      return ARENAS[pick];
    }
  } else if (roll < HOME_ARENA_WEIGHT + NEUTRAL_ARENA_WEIGHT) {
    return ARENAS['neutral-circuit'];
  } else if (roll < HOME_ARENA_WEIGHT + NEUTRAL_ARENA_WEIGHT + BONEFIELDS_WEIGHT) {
    return ARENAS['bonefields'];
  }

  return ARENAS['neutral-circuit']; // safety fallback, never block an episode
}
