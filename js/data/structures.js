import { ENCHANT_TABLE_COST, POTION_TABLE_COST } from "../config.js";

// Village structures the player builds and places. Level N costs N × `cost` (new or upgraded);
// `w × h` tiles, solid once placed.
export const STRUCTURES = Object.freeze({
  enchantingTable: {
    id: "enchantingTable",
    name: "Enchanting Table",
    w: 2,
    h: 1,
    cost: ENCHANT_TABLE_COST,
    about: "Apply boss runes to gear. Level N holds N runes per piece.",
  },
  potionTable: {
    id: "potionTable",
    name: "Potion Table",
    w: 1,
    h: 1,
    cost: POTION_TABLE_COST,
    about: "Brew potions from goop. Level N brews potions up to level N.",
  },
});
export const STRUCTURE_TYPES = Object.freeze(Object.keys(STRUCTURES));

/** Materials to build `kind` at `level` (or to upgrade it to `level`): { stone, wood }. */
export function structureCost(kind, level) {
  return Object.fromEntries(Object.entries(STRUCTURES[kind].cost).map(([material, n]) => [material, n * level]));
}
