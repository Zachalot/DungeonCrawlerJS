import { POTION_COOLDOWN } from "../config.js";
import { ITEMS } from "../data/items.js";
import { countItem, takeItem } from "./inventory.js";
import { maxHp, maxMana } from "./stats.js";

/**
 * Drinks one potion of type `defId` from the bag.
 * Returns { ok: true, restored } or { ok: false, reason: "cooldown" | "full" | "none" }.
 */
export function drinkPotion(player, defId) {
  const { resource, effect } = ITEMS[defId];
  if (player.potionCooldown > 0) return { ok: false, reason: "cooldown" };
  const max = resource === "hp" ? maxHp(player.stats) : maxMana(player.stats);
  if (player[resource] >= max) return { ok: false, reason: "full" };
  if (countItem(player.inventory, defId) === 0) return { ok: false, reason: "none" };

  takeItem(player.inventory, defId, 1);
  const amount = effect.flat ?? Math.floor(max * effect.percent);
  const before = player[resource];
  player[resource] = Math.min(max, before + amount);
  player.potionCooldown = POTION_COOLDOWN;
  return { ok: true, restored: player[resource] - before };
}
