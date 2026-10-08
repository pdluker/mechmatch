import { CORE_CHART } from './core-effectiveness.js';
const FRAMES = {
  Vanguard: { hp: [80, 100], attack: [110, 130], defense: [70, 90], speed: [70, 90] },
  Bulwark: { hp: [100, 120], attack: [70, 90], defense: [110, 130], speed: [40, 60] },
  Interceptor: { hp: [60, 80], attack: [80, 100], defense: [60, 80], speed: [110, 130] },
  Siege: { hp: [70, 90], attack: [125, 140], defense: [60, 80], speed: [30, 50] },
  Sentinel: { hp: [90, 110], attack: [50, 70], defense: [125, 140], speed: [30, 50] },
  Skirmisher: { hp: [50, 65], attack: [90, 105], defense: [55, 70], speed: [105, 125] },
  Ronin: { hp: [80, 95], attack: [85, 100], defense: [80, 95], speed: [80, 95] },
  Colossus: { hp: [120, 140], attack: [110, 130], defense: [80, 100], speed: [25, 40] }
};
const CORES = Object.keys(CORE_CHART);
const SIGNATURE_WEAPONS = ["Lance Driver","Fracture Cannon","Twin Talons","Aegis Slam","Coil Whip","Riftblade","Anchor Chain","Static Lash","Gravity Well","Ashfall Barrage","Tidebreaker Harpoon","Thornlash","Sundial Edge","Voltcage Net","Cryo Spike Array"];
const FACTIONS = {
  "Ashguard Combine": { region: "The Foundry Belt", palette: "molten orange / iron-red" },
  "Skyline Concord": { region: "The High Reaches", palette: "glacier-blue / white" },
  "Tidewrought Assembly": { region: "The Salt Archipelago", palette: "teal / pearl" },
  "Wraithline Circuit": { region: "The Hollow Ruins", palette: "matte black / violet" },
  "Ironroot Concord": { region: "The Deep Canopy", palette: "moss-green / bronze" },
  "Aurelian Accord": { region: "Aurel (the Capital)", palette: "gold / ivory" },
  "Static Vanguard": { region: "The Volt Flats", palette: "crackling yellow / graphite" },
  "Thornback Cartel": { region: null, palette: "patchwork - no fixed palette" }
};
function randInt(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickKey(obj, excludeSet) {
  const keys = Object.keys(obj);
  let pool = keys;
  if (excludeSet && excludeSet.size) {
    const filtered = keys.filter((k) => !excludeSet.has(k));
    if (filtered.length) pool = filtered;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}
function statFromRange([min, max]) { return randInt(min, max); }
function buildChassisName(frame, core, faction) { return `${faction.split(" ")[0]} ${frame}-${core.slice(0, 3).toUpperCase()}`; }
export function generateChassis({ excludeFrames, excludeFactions, forceFaction } = {}) {
  const frameName = pickKey(FRAMES, excludeFrames);
  const core = pick(CORES);
  const weapon = pick(SIGNATURE_WEAPONS);
  if (forceFaction && !FACTIONS[forceFaction]) {
    throw new Error(`generateChassis: unknown forceFaction "${forceFaction}"`);
  }
  const factionName = forceFaction || pickKey(FACTIONS, excludeFactions);
  const shape = FRAMES[frameName];
  const stats = { hp: statFromRange(shape.hp), attack: statFromRange(shape.attack), defense: statFromRange(shape.defense), speed: statFromRange(shape.speed) };
  const bst = stats.hp + stats.attack + stats.defense + stats.speed;
  return { name: buildChassisName(frameName, core, factionName), frame: frameName, core, signatureWeapon: weapon, faction: factionName, factionRegion: FACTIONS[factionName].region, stats, bst };
}
export const BST_BANDS = [50, 90, 140, 220];
export { SIGNATURE_WEAPONS, FACTIONS };
