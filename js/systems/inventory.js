import { ARMOR_SLOTS, EQUIP_SLOTS, ITEMS } from "../data/items.js";

// Slot arrays hold { uid, defId, qty } or null. `newUid` is a () => string supplied by the game.

export function createSlots(size) {
  return new Array(size).fill(null);
}

/** Adds items, filling existing stacks first. Returns the quantity that didn't fit. */
export function addItem(slots, defId, qty, newUid) {
  const def = ITEMS[defId];
  let remaining = qty;
  if (def.stackable) {
    for (const slot of slots) {
      if (remaining === 0) break;
      if (slot?.defId !== defId || slot.qty >= def.maxStack) continue;
      const moved = Math.min(remaining, def.maxStack - slot.qty);
      slot.qty += moved;
      remaining -= moved;
    }
  }
  for (let i = 0; i < slots.length && remaining > 0; i++) {
    if (slots[i]) continue;
    const moved = Math.min(remaining, def.maxStack);
    slots[i] = { uid: newUid(), defId, qty: moved };
    remaining -= moved;
  }
  return remaining;
}

/** Adds an existing instance (keeping its uid when it lands whole in an empty slot). Returns leftover qty. */
export function addInstance(slots, instance, newUid) {
  const def = ITEMS[instance.defId];
  if (!def.stackable) {
    const free = slots.indexOf(null);
    if (free === -1) return instance.qty;
    slots[free] = { ...instance };
    return 0;
  }
  return addItem(slots, instance.defId, instance.qty, newUid);
}

/** True if `qty` of `defId` would fit entirely. */
export function canFit(slots, defId, qty) {
  return addItem(slots.map((s) => (s ? { ...s } : null)), defId, qty, () => "probe") === 0;
}

/** Removes up to `qty` (default: all) from one slot; returns { defId, qty } removed, or null. */
export function removeFromSlot(slots, index, qty = Infinity) {
  const slot = slots[index];
  if (!slot) return null;
  const removed = Math.min(qty, slot.qty);
  slot.qty -= removed;
  if (slot.qty === 0) slots[index] = null;
  return { defId: slot.defId, qty: removed };
}

export function countItem(slots, defId) {
  return slots.reduce((sum, s) => sum + (s?.defId === defId ? s.qty : 0), 0);
}

/** Removes `qty` of `defId` across stacks; returns false (and removes nothing) if there aren't enough. */
export function takeItem(slots, defId, qty) {
  if (countItem(slots, defId) < qty) return false;
  let remaining = qty;
  for (let i = slots.length - 1; i >= 0 && remaining > 0; i--) {
    if (slots[i]?.defId !== defId) continue;
    remaining -= removeFromSlot(slots, i, remaining).qty;
  }
  return true;
}

export function freeSlotCount(slots) {
  return slots.filter((s) => s === null).length;
}

/** Empty equipment: five armor slots and three weapon slots. */
export function createEquipment() {
  return Object.fromEntries(EQUIP_SLOTS.map((slot) => [slot, null]));
}

/** Sum of armor across equipped pieces. */
export function totalArmor(equipment) {
  return ARMOR_SLOTS.reduce((sum, slot) => sum + (equipment[slot] ? ITEMS[equipment[slot].defId].armor : 0), 0);
}

export function isEquippable(def) {
  return def.type === "armor" || def.type === "weapon";
}

/** Equips the item in inventory slot `index` into its own slot, swapping out whatever was there. */
export function equipFromInventory(player, index) {
  const def = ITEMS[player.inventory[index]?.defId];
  if (!def || !isEquippable(def)) return false;
  return equipToSlot(player, index, def.slot).ok;
}

/**
 * Equips inventory slot `index` into equipment `slot`, swapping the old piece into the bag slot.
 * Returns { ok } or { ok: false, reason: "empty" | "not-equippable" | "wrong-slot" }.
 */
export function equipToSlot(player, index, slot) {
  const instance = player.inventory[index];
  if (!instance) return { ok: false, reason: "empty" };
  const def = ITEMS[instance.defId];
  if (!isEquippable(def)) return { ok: false, reason: "not-equippable" };
  if (def.slot !== slot) return { ok: false, reason: "wrong-slot" };
  player.inventory[index] = player.equipment[slot];
  player.equipment[slot] = instance;
  return { ok: true };
}

/**
 * Moves an equipped piece into the bag: into `bagIndex` if given and empty, otherwise the
 * first free slot. Returns false if there's no room.
 */
export function unequip(player, slot, bagIndex = null) {
  const instance = player.equipment[slot];
  if (!instance) return false;
  const target = bagIndex !== null && player.inventory[bagIndex] === null ? bagIndex : player.inventory.indexOf(null);
  if (target === -1) return false;
  player.inventory[target] = instance;
  player.equipment[slot] = null;
  return true;
}

/** Moves a bag slot to another, swapping if the target is occupied. */
export function moveInBag(slots, from, to) {
  if (from === to || !slots[from]) return false;
  [slots[from], slots[to]] = [slots[to], slots[from]];
  return true;
}
