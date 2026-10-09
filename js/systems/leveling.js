import { RESPEC_COST_PER_LEVEL, STARTING_STATS, STAT_POINTS_PER_LEVEL, XP_CURVE, XP_PER_LEVEL } from "../config.js";
import { maxHp, maxMana, totalStats } from "./stats.js";

export const STAT_KEYS = Object.freeze(["str", "int", "dex", "end"]);

/** XP needed to go from `level` to the next: grows exponentially, so leveling slows down. */
export function xpToNext(level) {
  return Math.floor(XP_PER_LEVEL * level * XP_CURVE ** (level - 1));
}

/** Adds XP, levelling up as many times as it covers. Returns the number of levels gained. */
export function grantXp(player, amount) {
  player.xp += amount;
  let gained = 0;
  while (player.xp >= xpToNext(player.level)) {
    player.xp -= xpToNext(player.level);
    player.level++;
    player.unspentPoints += STAT_POINTS_PER_LEVEL;
    gained++;
  }
  if (gained > 0) {
    const stats = totalStats(player);
    player.hp = maxHp(stats);
    player.mana = maxMana(stats);
  }
  return gained;
}

/** Returns the stats that would result from applying `pending` ({ str: 2, ... }). */
export function previewStats(stats, pending) {
  const result = { ...stats };
  for (const key of STAT_KEYS) result[key] += pending[key] ?? 0;
  return result;
}

/**
 * Commits pending stat points. Current HP and mana rise by the same amount as
 * their maximums, so allocating Endurance mid-fight doesn't leave you "missing" HP.
 * Returns false (and changes nothing) if the allocation is invalid.
 */
export function allocatePoints(player, pending) {
  const total = STAT_KEYS.reduce((sum, key) => sum + (pending[key] ?? 0), 0);
  const valid = STAT_KEYS.every((key) => Number.isInteger(pending[key] ?? 0) && (pending[key] ?? 0) >= 0);
  if (!valid || total === 0 || total > player.unspentPoints) return false;

  const before = totalStats(player);
  player.stats = previewStats(player.stats, pending);
  player.unspentPoints -= total;
  const after = totalStats(player);
  player.hp += maxHp(after) - maxHp(before);
  player.mana += maxMana(after) - maxMana(before);
  return true;
}

export function respecCost(level) {
  return RESPEC_COST_PER_LEVEL * level;
}

/** Resets stats to the starting values and refunds every point, for gold. Returns false if unaffordable. */
export function respec(player) {
  const cost = respecCost(player.level);
  if (player.gold < cost) return false;
  player.gold -= cost;
  player.stats = { ...STARTING_STATS };
  player.unspentPoints = (player.level - 1) * STAT_POINTS_PER_LEVEL;
  const stats = totalStats(player);
  player.hp = Math.min(player.hp, maxHp(stats));
  player.mana = Math.min(player.mana, maxMana(stats));
  return true;
}
