import { MAX_ARROWS } from "../config.js";
import { ARMOR_SLOTS } from "../data/items.js";
import { addInstance, createEquipment } from "./inventory.js";

/**
 * Strips the player's equipped armor, bag, and arrows into a grave's contents.
 * Gold, stats, and the starter weapons stay with the player.
 */
export function buryGear(player) {
  const contents = {
    equipment: { ...player.equipment },
    items: player.inventory.filter(Boolean),
    arrows: player.arrows,
  };
  player.equipment = createEquipment();
  player.inventory.fill(null);
  player.arrows = 0;
  return contents;
}

export function isGraveEmpty(grave) {
  return grave.items.length === 0 && grave.arrows === 0 && ARMOR_SLOTS.every((slot) => !grave.equipment[slot]);
}

/**
 * Returns grave contents to the player: armor goes back into its slot if that slot is
 * empty (otherwise into the bag), then bag items, then arrows. Whatever doesn't fit
 * stays in the grave. Returns true if the grave is now empty.
 */
export function recoverGrave(player, grave, newUid) {
  for (const slot of ARMOR_SLOTS) {
    const piece = grave.equipment[slot];
    if (!piece) continue;
    if (!player.equipment[slot]) {
      player.equipment[slot] = piece;
      grave.equipment[slot] = null;
    } else if (addInstance(player.inventory, piece, newUid) === 0) {
      grave.equipment[slot] = null;
    }
  }
  grave.items = grave.items
    .map((instance) => {
      const leftover = addInstance(player.inventory, instance, newUid);
      return leftover === 0 ? null : { ...instance, qty: leftover };
    })
    .filter(Boolean);
  const moved = Math.min(grave.arrows, MAX_ARROWS - player.arrows);
  player.arrows += moved;
  grave.arrows -= moved;
  return isGraveEmpty(grave);
}
