import { POTION_COOLDOWN } from "../config.js";
import { ITEMS, POTION_PRIORITY } from "../data/items.js";
import { countItem, takeItem } from "./inventory.js";
import { maxHp, maxMana } from "./stats.js";

/**
 * Drinks the best available potion for `resource` ("hp" | "mana").
 * Returns { ok: true, defId, restored } or { ok: false, reason }.
 */
export function drinkBestPotion(player, resource) {
  if (player.potionCooldown > 0) return { ok: false, reason: "cooldown" };
  const max = resource === "hp" ? maxHp(player.stats) : maxMana(player.stats);
  if (player[resource] >= max) return { ok: false, reason: "full" };

  const defId = POTION_PRIORITY[resource].find((id) => countItem(player.inventory, id) > 0);
  if (!defId) return { ok: false, reason: "none" };

  takeItem(player.inventory, defId, 1);
  const { effect } = ITEMS[defId];
  const amount = effect.flat ?? Math.floor(max * effect.percent);
  const before = player[resource];
  player[resource] = Math.min(max, before + amount);
  player.potionCooldown = POTION_COOLDOWN;
  return { ok: true, defId, restored: player[resource] - before };
}
