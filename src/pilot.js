export const PILOT_ARCHETYPES = {
  Veteran: { label: "The Veteran", statModifiers: { defense: 12, speed: -8 }, preferredFrames: ["Bulwark","Sentinel","Colossus"], conflictingFrames: ["Interceptor","Skirmisher"] },
  Prodigy: { label: "The Prodigy", statModifiers: { speed: 12, defense: -8 }, preferredFrames: ["Interceptor","Skirmisher"], conflictingFrames: ["Bulwark","Sentinel"], syncVolatility: { winsThreshold: 15, desyncChancePerBattle: 0.12 } },
  ReluctantSuccessor: { label: "The Reluctant Successor", startStatPercent: 0.8, winGrowthPercent: 0.02, capStatPercent: 1.1, preferredFrames: [], conflictingFrames: [] },
  Vengeful: { label: "The Vengeful", conditionalAttackBonus: 15, preferredFrames: ["Vanguard","Siege"], conflictingFrames: ["Bulwark","Sentinel"] },
  TrueBeliever: { label: "The True Believer", statModifiers: { defense: 16, speed: -6 }, immunity: { type: "debuff-class-move", scope: "one per faction", implemented: false }, preferredFrames: ["Sentinel","Bulwark"], conflictingFrames: ["Interceptor","Skirmisher"] },
  Independent: { label: "The Independent (Thornback-style)", statModifiers: { speed: 6, defense: -4 }, designed: true, preferredFrames: ["Ronin","Colossus"], conflictingFrames: [] },
  // NEW 2026-08-19, explicit direction given: "durability-leaning, no
  // offense bonus." Attack is NOT boosted (per instruction) and is
  // actually reduced, matching the paired-tradeoff pattern every other
  // archetype here uses (no free lunch) rather than a pure stat gain
  // with no downside. Magnitude (|14|+|10|=24) sits close to True
  // Believer's 22 in the existing numeric-identity ranking - a
  // deliberately tanky, low-offense profile.
  Mechanic: { label: "The Mechanic", statModifiers: { defense: 14, attack: -10 }, preferredFrames: ["Bulwark","Sentinel"], conflictingFrames: ["Interceptor","Skirmisher"] }
};
function applyFlatModifiers(chassisStats, archetypeKey) {
  const archetype = PILOT_ARCHETYPES[archetypeKey];
  if (!archetype || !archetype.statModifiers) return { ...chassisStats };
  const result = { ...chassisStats };
  for (const [stat, delta] of Object.entries(archetype.statModifiers)) result[stat] = Math.max(1, result[stat] + delta);
  return result;
}
function reluctantSuccessorStats(chassisStats, winsInSeat) {
  const { startStatPercent, winGrowthPercent, capStatPercent } = PILOT_ARCHETYPES.ReluctantSuccessor;
  const percent = Math.min(capStatPercent, startStatPercent + winGrowthPercent * winsInSeat);
  const result = {};
  for (const [stat, value] of Object.entries(chassisStats)) result[stat] = Math.max(1, Math.round(value * percent));
  return { stats: result, percent };
}
export function pilotedStats(chassisStats, archetypeKey, winsInSeat = 0) {
  if (archetypeKey === "ReluctantSuccessor") return reluctantSuccessorStats(chassisStats, winsInSeat).stats;
  return applyFlatModifiers(chassisStats, archetypeKey);
}
export function conditionalAttackBonus(archetypeKey, hasLostTo) {
  const archetype = PILOT_ARCHETYPES[archetypeKey];
  if (!archetype || !archetype.conditionalAttackBonus) return 0;
  return hasLostTo ? archetype.conditionalAttackBonus : 0;
}
const SYNC_MIN = 0, SYNC_MAX = 100, SYNC_MULT_MIN = 0.85, SYNC_MULT_MAX = 1.2, SYNC_BASE = 50, SYNC_FIT_BONUS = 15, SYNC_FIT_PENALTY = 15;
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
export function initialSyncRate(archetypeKey, frameName) {
  const archetype = PILOT_ARCHETYPES[archetypeKey];
  if (!archetype) return SYNC_BASE;
  let sync = SYNC_BASE;
  if (archetype.preferredFrames?.includes(frameName)) sync += SYNC_FIT_BONUS;
  if (archetype.conflictingFrames?.includes(frameName)) sync -= SYNC_FIT_PENALTY;
  return clamp(sync, SYNC_MIN, SYNC_MAX);
}
const SYNC_GAIN_PER_WIN = 4;
export function syncRateAfterWin(currentSync) { return clamp(currentSync + SYNC_GAIN_PER_WIN, SYNC_MIN, SYNC_MAX); }
export function syncMultiplier(syncRate) {
  const t = clamp(syncRate, SYNC_MIN, SYNC_MAX) / SYNC_MAX;
  return SYNC_MULT_MIN + t * (SYNC_MULT_MAX - SYNC_MULT_MIN);
}
export function checkDesync(archetypeKey, winsInSeat) {
  const archetype = PILOT_ARCHETYPES[archetypeKey];
  const volatility = archetype?.syncVolatility;
  if (!volatility) return false;
  if (winsInSeat >= volatility.winsThreshold) return false;
  return Math.random() < volatility.desyncChancePerBattle;
}
