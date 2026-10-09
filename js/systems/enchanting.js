import { CONVERT_GOLD_PER_LEVEL, ENCHANT_GOLD_PER_LEVEL, RUNE_CONVERT_RATIO } from "../config.js";
import { ITEMS } from "../data/items.js";
import { RUNES } from "../data/enemies.js";
import { runeCount } from "./stats.js";

/** Gold to apply one rune at player level `level`. */
export function enchantCost(level) {
  return ENCHANT_GOLD_PER_LEVEL * level;
}

/** Gold for one conversion (RUNE_CONVERT_RATIO runes → 1 of another type) at player level `level`. */
export function convertCost(level) {
  return CONVERT_GOLD_PER_LEVEL * level;
}

export function isEnchantable(instance) {
  const type = instance && ITEMS[instance.defId]?.type;
  return type === "armor" || type === "weapon";
}

/**
 * Applies one rune of `stat` to a gear piece, for gold. A table of level N holds N runes per piece.
 * Returns { ok } or { ok: false, reason: "piece" | "rune" | "full" | "gold" }.
 */
export function applyRune(player, instance, stat, tableLevel) {
  if (!isEnchantable(instance)) return { ok: false, reason: "piece" };
  if (!RUNES[stat] || player.runes[stat] < 1) return { ok: false, reason: "rune" };
  if (runeCount(instance) >= tableLevel) return { ok: false, reason: "full" };
  const cost = enchantCost(player.level);
  if (player.gold < cost) return { ok: false, reason: "gold" };
  player.gold -= cost;
  player.runes[stat] -= 1;
  instance.enchants = { ...instance.enchants, [stat]: (instance.enchants?.[stat] ?? 0) + 1 };
  return { ok: true };
}

/**
 * Turns RUNE_CONVERT_RATIO runes of `from` into one of `to`, for gold.
 * Returns { ok } or { ok: false, reason: "same" | "rune" | "gold" }.
 */
export function convertRunes(player, from, to) {
  if (from === to || !RUNES[from] || !RUNES[to]) return { ok: false, reason: "same" };
  if (player.runes[from] < RUNE_CONVERT_RATIO) return { ok: false, reason: "rune" };
  const cost = convertCost(player.level);
  if (player.gold < cost) return { ok: false, reason: "gold" };
  player.gold -= cost;
  player.runes[from] -= RUNE_CONVERT_RATIO;
  player.runes[to] += 1;
  return { ok: true };
}
