import { ARMOR_SLOTS } from "./items.js";

// Dungeon chest: always gold, plus one weighted roll. Entries are { defId, qty } or { arrows }.
export const CHEST_LOOT = Object.freeze({
  gold: [20, 40],
  rolls: [
    { weight: 60, pick: (random) => [{ defId: `steel_${ARMOR_SLOTS[Math.floor(random() * ARMOR_SLOTS.length)]}`, qty: 1 }] },
    {
      weight: 25,
      pick: () => [
        { defId: "greater_hp_potion", qty: 3 },
        { defId: "greater_mana_potion", qty: 3 },
      ],
    },
    { weight: 15, pick: () => [{ arrows: 100 }] },
  ],
});
