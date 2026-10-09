import { MAX_ARROWS } from "../config.js";
import { ITEMS } from "../data/items.js";
import { BUYBACK_SIZE } from "../data/vendors.js";
import { addItem, canFit, removeFromSlot } from "./inventory.js";

/** Price and display name of a vendor stock entry. */
export function describeEntry(entry) {
  if (entry.arrows) return { name: `${entry.arrows} Arrows`, price: entry.price };
  const def = ITEMS[entry.item];
  return { name: def.name, price: def.buyPrice };
}

/** Buys one stock entry. Returns { ok } or { ok: false, reason: "gold" | "space" | "quiver" }. */
export function buyEntry(player, entry, newUid) {
  const { price } = describeEntry(entry);
  if (player.gold < price) return { ok: false, reason: "gold" };
  if (entry.arrows) {
    if (player.arrows >= MAX_ARROWS) return { ok: false, reason: "quiver" };
    player.gold -= price;
    player.arrows = Math.min(MAX_ARROWS, player.arrows + entry.arrows);
    return { ok: true };
  }
  if (!canFit(player.inventory, entry.item, 1)) return { ok: false, reason: "space" };
  player.gold -= price;
  addItem(player.inventory, entry.item, 1, newUid);
  return { ok: true };
}

/** Sells one item from an inventory slot at its sell price, recording it for buyback. Returns gold earned. */
export function sellFromSlot(player, index, buyback) {
  const removed = removeFromSlot(player.inventory, index, 1);
  if (!removed) return 0;
  const price = ITEMS[removed.defId].sellPrice;
  player.gold += price;
  buyback.unshift({ defId: removed.defId, price });
  buyback.length = Math.min(buyback.length, BUYBACK_SIZE);
  return price;
}

/** Repurchases a buyback entry at the price it sold for. Returns { ok } or { ok: false, reason }. */
export function repurchase(player, buyback, index, newUid) {
  const entry = buyback[index];
  if (!entry) return { ok: false, reason: "missing" };
  if (player.gold < entry.price) return { ok: false, reason: "gold" };
  if (!canFit(player.inventory, entry.defId, 1)) return { ok: false, reason: "space" };
  player.gold -= entry.price;
  addItem(player.inventory, entry.defId, 1, newUid);
  buyback.splice(index, 1);
  return { ok: true };
}
