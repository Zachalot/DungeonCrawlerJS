import { ARMOR_SLOTS, potionId } from "./items.js";

// Dungeon chest: always gold (× the dungeon's level), plus one weighted roll (two if the boss
// died). Entries are { defId, qty } or { arrows }. Potions match the dungeon's level.
export const CHEST_LOOT = Object.freeze({
  gold: [20, 40],
  rolls: [
    { weight: 60, pick: (random) => [{ defId: `steel_${ARMOR_SLOTS[Math.floor(random() * ARMOR_SLOTS.length)]}`, qty: 1 }] },
    {
      weight: 25,
      pick: (random, level) => [
        { defId: potionId("hp", level), qty: 3 },
        { defId: potionId("mana", level), qty: 3 },
      ],
    },
    { weight: 15, pick: () => [{ arrows: 100 }] },
  ],
});
