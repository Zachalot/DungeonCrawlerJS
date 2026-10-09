import { ARROW_GOLD_PER_LEVEL, MAX_ARROWS, MAX_ITEM_LEVEL } from "../config.js";
import { ITEMS, potionId } from "../data/items.js";
import { BUYBACK_SIZE, POTION_LEVELS_SOLD, VENDORS } from "../data/vendors.js";
import { addItem, canFit, removeFromSlot } from "./inventory.js";

/** A vendor's buyable entries for this player: potion entries expand to item entries by level. */
export function vendorStock(vendorId, player) {
  const entries = [];
  for (const entry of VENDORS[vendorId].stock) {
    if (!entry.potions) {
      entries.push(entry);
      continue;
    }
    const top = Math.min(MAX_ITEM_LEVEL, player.level);
    const bottom = Math.max(1, top - POTION_LEVELS_SOLD + 1);
    for (const kind of entry.potions) {
      for (let level = bottom; level <= top; level++) entries.push({ item: potionId(kind, level) });
    }
  }
  return entries;
}

/** Price and display name of a stock entry. Arrows cost more as the player levels. */
export function describeEntry(entry, player) {
  if (entry.arrows) return { name: `${entry.arrows} Arrows`, price: Math.ceil(ARROW_GOLD_PER_LEVEL * player.level * entry.arrows) };
  const def = ITEMS[entry.item];
  return { name: def.name, price: def.buyPrice };
}

/** Buys one stock entry. Returns { ok } or { ok: false, reason: "gold" | "space" | "quiver" }. */
export function buyEntry(player, entry, newUid) {
  const { price } = describeEntry(entry, player);
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
