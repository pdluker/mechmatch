import { coreEffectiveness, coreEffectivenessLabel } from './core-effectiveness.js';
import { pilotedStats, conditionalAttackBonus, initialSyncRate, syncMultiplier, checkDesync } from './pilot.js';
import { getMoveset, pickMove } from './moves.js';
const DAMAGE_SCALE = 0.35, BASE_CRIT_CHANCE = 0.08, CRIT_MULTIPLIER = 1.5, MAX_TURNS = 30;
const BLOWOUT_SURVIVOR_THRESHOLD = 0.7, NARROW_WIN_SURVIVOR_THRESHOLD = 0.15;
// NEW 2026-08-22, found via transcript review: everything between 15%
// and 70% survivor HP got identical "clean, well-earned win" language,
// so a winner who barely cleared narrow-win territory (e.g. 19%) sounded
// exactly as comfortable as one who won with 65% left. This tier isn't
// a new win/loss category - it's purely a narration-tone signal.
const HARD_FOUGHT_UPPER_THRESHOLD = 0.35;
export function buildFighter({ name, chassis, archetypeKey, winsInSeat = 0, hasLostToOpponent = false, syncRateOverride = null }) {
  const baseStats = pilotedStats(chassis.stats, archetypeKey, winsInSeat);
  const attackBonus = conditionalAttackBonus(archetypeKey, hasLostToOpponent);
  const stats = { ...baseStats, attack: Math.max(1, baseStats.attack + attackBonus) };
  const sync = syncRateOverride ?? initialSyncRate(archetypeKey, chassis.frame);
  const pendingDesync = checkDesync(archetypeKey, winsInSeat);
  return { name, chassisName: chassis.name, frame: chassis.frame, faction: chassis.faction, core: chassis.core, archetypeKey, stats, maxHp: stats.hp, hp: stats.hp, sync, moveset: getMoveset(chassis), pendingDesync, desyncUsed: false };
}
function computeDamage({ attacker, defender, move, isCrit }) {
  const ratio = attacker.stats.attack / Math.max(1, defender.stats.defense);
  const coreMult = coreEffectiveness(attacker.core, defender.core);
  const syncMult = syncMultiplier(attacker.sync);
  const critMult = isCrit ? CRIT_MULTIPLIER : 1;
  const raw = move.power * ratio * DAMAGE_SCALE * coreMult * syncMult * critMult;
  return { damage: Math.max(1, Math.round(raw)), coreMult, syncMult, critMult };
}
export function simulateBattle(fighterA, fighterB) {
  let order;
  if (fighterA.stats.speed === fighterB.stats.speed) order = Math.random() < 0.5 ? [fighterA, fighterB] : [fighterB, fighterA];
  else order = fighterA.stats.speed > fighterB.stats.speed ? [fighterA, fighterB] : [fighterB, fighterA];
  const log = [];
  let turn = 0;
  const other = (f) => (f === fighterA ? fighterB : fighterA);
  while (fighterA.hp > 0 && fighterB.hp > 0 && turn < MAX_TURNS) {
    for (const attacker of order) {
      if (attacker.hp <= 0) continue;
      const defender = other(attacker);
      if (defender.hp <= 0) break;
      turn += 1;
      if (attacker.pendingDesync && !attacker.desyncUsed) {
        attacker.desyncUsed = true;
        log.push({ turn, attacker: attacker.name, defender: defender.name, event: "desync", move: null, hit: false, crit: false, damage: 0, defenderHpAfter: defender.hp });
        continue;
      }
      const move = pickMove(attacker.moveset);
      const hit = Math.random() < move.accuracy;
      if (!hit) {
        log.push({ turn, attacker: attacker.name, defender: defender.name, event: "miss", move: move.name, hit: false, crit: false, damage: 0, defenderHpAfter: defender.hp });
        continue;
      }
      const critChance = BASE_CRIT_CHANCE + (move.critBonus || 0);
      const isCrit = Math.random() < critChance;
      const { damage, coreMult, syncMult, critMult } = computeDamage({ attacker, defender, move, isCrit });
      defender.hp = Math.max(0, defender.hp - damage);
      log.push({ turn, attacker: attacker.name, defender: defender.name, event: "attack", move: move.name, hit: true, crit: isCrit, coreMult, syncMult, critMult, effectivenessLabel: coreEffectivenessLabel(coreMult), damage, defenderHpAfter: defender.hp });
      if (defender.hp <= 0) break;
    }
  }
  const winner = fighterA.hp > 0 && fighterB.hp <= 0 ? fighterA : fighterB.hp > 0 && fighterA.hp <= 0 ? fighterB : fighterA.hp >= fighterB.hp ? fighterA : fighterB;
  const loser = winner === fighterA ? fighterB : fighterA;
  const timedOut = fighterA.hp > 0 && fighterB.hp > 0;
  const survivorFrac = winner.hp / winner.maxHp;
  return {
    log, turns: turn, winner: winner.name, loser: loser.name, timedOut,
    blowout: !timedOut && survivorFrac >= BLOWOUT_SURVIVOR_THRESHOLD,
    narrowWin: !timedOut && survivorFrac <= NARROW_WIN_SURVIVOR_THRESHOLD,
    hardFought: !timedOut && survivorFrac > NARROW_WIN_SURVIVOR_THRESHOLD && survivorFrac <= HARD_FOUGHT_UPPER_THRESHOLD,
    decisiveFactor: decisiveFactor(log, winner.name)
  };
}
const DECISIVE_FACTOR_MIN_SHARE = 0.15;
function decisiveFactor(log, winnerName) {
  let coreBonus = 0, syncBonus = 0, critBonus = 0, totalDamage = 0;
  for (const entry of log) {
    if (entry.event !== "attack" || entry.attacker !== winnerName) continue;
    totalDamage += entry.damage;
    const critMult = entry.crit ? entry.critMult : 1;
    const neutralDamage = entry.damage / (entry.coreMult * entry.syncMult * critMult);
    coreBonus += neutralDamage * (entry.coreMult - 1);
    syncBonus += neutralDamage * (entry.syncMult - 1);
    if (entry.crit) critBonus += neutralDamage * (critMult - 1);
  }
  if (totalDamage === 0) return "attrition";
  const contributions = { "core-effectiveness": coreBonus, sync: syncBonus, "critical-hits": critBonus };
  const [factor, amount] = Object.entries(contributions).sort((a, b) => b[1] - a[1])[0];
  if (amount <= 0 || amount / totalDamage < DECISIVE_FACTOR_MIN_SHARE) return "attrition";
  return factor;
}
