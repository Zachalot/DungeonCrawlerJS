import { POTION_CRAFT_GOLD_PER_LEVEL } from "../config.js";
import { potionId } from "../data/items.js";
import { addItem, canFit } from "./inventory.js";

// Goop per potion level, by kind (issue #15): health = red, mana = blue, travel = 3 red + 3 green.
const RECIPES = Object.freeze({
  hp: { redGoop: 1 },
  mana: { blueGoop: 1 },
  travel: { redGoop: 3, greenGoop: 3 },
});

/** What a level N potion of `kind` costs to brew: { gold, materials: { redGoop: N, … } }. */
export function recipe(kind, level) {
  return {
    gold: POTION_CRAFT_GOLD_PER_LEVEL * level,
    materials: Object.fromEntries(Object.entries(RECIPES[kind]).map(([material, n]) => [material, n * level])),
  };
}

/**
 * Brews one potion at a potion table of `tableLevel`. Returns { ok, defId } or
 * { ok: false, reason: "level" | "materials" | "gold" | "space" }.
 */
export function craftPotion(player, kind, level, tableLevel, newUid) {
  if (level < 1 || level > tableLevel) return { ok: false, reason: "level" };
  const { gold, materials } = recipe(kind, level);
  if (Object.entries(materials).some(([material, n]) => player.materials[material] < n)) return { ok: false, reason: "materials" };
  if (player.gold < gold) return { ok: false, reason: "gold" };
  const defId = potionId(kind, level);
  if (!canFit(player.inventory, defId, 1)) return { ok: false, reason: "space" };
  player.gold -= gold;
  for (const [material, n] of Object.entries(materials)) player.materials[material] -= n;
  addItem(player.inventory, defId, 1, newUid);
  return { ok: true, defId };
}
