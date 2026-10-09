import { MAX_ARROWS } from "../config.js";
import { EQUIP_SLOTS, ITEMS } from "../data/items.js";
import { addInstance, createEquipment } from "./inventory.js";

const isStarter = (instance) => ITEMS[instance.defId].tier === "starter";

/**
 * Strips the player's equipment, bag, and arrows into a grave's contents. Equipped starter
 * weapons stay on the player (they'd be handed out again anyway); gold and stats are kept.
 */
export function buryGear(player) {
  const equipment = createEquipment();
  const kept = createEquipment();
  for (const slot of EQUIP_SLOTS) {
    const piece = player.equipment[slot];
    if (!piece) continue;
    if (isStarter(piece) && ITEMS[piece.defId].type === "weapon") kept[slot] = piece;
    else equipment[slot] = piece;
  }
  const contents = { equipment, items: player.inventory.filter(Boolean), arrows: player.arrows };
  player.equipment = kept;
  player.inventory.fill(null);
  player.arrows = 0;
  return contents;
}

export function isGraveEmpty(grave) {
  return grave.items.length === 0 && grave.arrows === 0 && EQUIP_SLOTS.every((slot) => !grave.equipment[slot]);
}

/**
 * Returns grave contents to the player. Each buried piece goes back into its slot if that
 * slot is empty or only holds a starter weapon (the starter moves to the bag, or is dropped
 * if the bag is full: it's free). Otherwise it goes into the bag. Then bag items, then
 * arrows. Whatever doesn't fit stays in the grave. Returns true if the grave is now empty.
 */
export function recoverGrave(player, grave, newUid) {
  for (const slot of EQUIP_SLOTS) {
    const piece = grave.equipment[slot];
    if (!piece) continue;
    const current = player.equipment[slot];
    if (!current || (isStarter(current) && !isStarter(piece))) {
      if (current) addInstance(player.inventory, current, newUid);
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
