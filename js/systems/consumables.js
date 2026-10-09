import { POTION_COOLDOWN } from "../config.js";
import { ITEMS, potionId } from "../data/items.js";
import { countItem, takeItem } from "./inventory.js";
import { maxHp, maxMana, totalStats } from "./stats.js";

/**
 * Drinks one health or mana potion of type `defId` from the bag.
 * Returns { ok: true, restored } or { ok: false, reason: "cooldown" | "full" | "none" }.
 * Travel potions aren't drunk here: they open the travel menu (Game.useTravelPotion).
 */
export function drinkPotion(player, defId) {
  const { resource, amount } = ITEMS[defId];
  if (player.potionCooldown > 0) return { ok: false, reason: "cooldown" };
  const stats = totalStats(player);
  const max = resource === "hp" ? maxHp(stats) : maxMana(stats);
  if (player[resource] >= max) return { ok: false, reason: "full" };
  if (countItem(player.inventory, defId) === 0) return { ok: false, reason: "none" };

  takeItem(player.inventory, defId, 1);
  const before = player[resource];
  player[resource] = Math.min(max, before + amount);
  player.potionCooldown = POTION_COOLDOWN;
  return { ok: true, restored: player[resource] - before };
}

/** Potion levels of one kind in the bag, highest first: [{ level, count }]. */
export function potionLevels(inventory, kind) {
  const counts = new Map();
  for (const slot of inventory) {
    const def = slot && ITEMS[slot.defId];
    if (def?.potion === kind) counts.set(def.level, (counts.get(def.level) ?? 0) + slot.qty);
  }
  return [...counts].map(([level, count]) => ({ level, count })).sort((a, b) => b.level - a.level);
}

/**
 * The potion the quick wheel uses for `kind`: the level the player picked if they still carry
 * it, otherwise their highest level. Returns a defId, or null if they carry none.
 */
export function wheelPotion(player, kind) {
  const chosen = player.wheelLevels?.[kind];
  if (chosen && countItem(player.inventory, potionId(kind, chosen)) > 0) return potionId(kind, chosen);
  const [highest] = potionLevels(player.inventory, kind);
  return highest ? potionId(kind, highest.level) : null;
}

/** Steps the wheel's chosen level for `kind` to the next (+1) or previous (−1) level carried. */
export function cycleWheelLevel(player, kind, direction) {
  const levels = potionLevels(player.inventory, kind).map((p) => p.level).sort((a, b) => a - b);
  if (levels.length === 0) return null;
  const current = ITEMS[wheelPotion(player, kind)].level;
  const index = levels.indexOf(current);
  const next = levels[(index + direction + levels.length) % levels.length];
  player.wheelLevels = { ...player.wheelLevels, [kind]: next };
  return next;
}
