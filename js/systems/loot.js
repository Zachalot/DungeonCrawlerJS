import { MAX_ARROWS } from "../config.js";
import { DROP_TABLES } from "../data/drops.js";
import { CHEST_LOOT } from "../data/lootTables.js";

/** Rolls a drop table; returns { gold, arrows } totals. */
export function rollDrops(tableId, random = Math.random) {
  const result = { gold: 0, arrows: 0 };
  for (const entry of DROP_TABLES[tableId] ?? []) {
    if (random() >= entry.chance) continue;
    if (entry.gold) result.gold += randomInt(entry.gold, random);
    if (entry.arrows) result.arrows += randomInt(entry.arrows, random);
  }
  return result;
}

/** Adds rolled drops to the player; arrows are capped by the quiver size. */
export function collectDrops(player, drops) {
  player.gold += drops.gold;
  player.arrows = Math.min(MAX_ARROWS, player.arrows + drops.arrows);
}

/** Rolls a dungeon chest: { gold, items: [{ defId, qty } | { arrows }] }. */
export function rollChestLoot(random = Math.random) {
  const total = CHEST_LOOT.rolls.reduce((sum, r) => sum + r.weight, 0);
  let roll = random() * total;
  const entry = CHEST_LOOT.rolls.find((r) => (roll -= r.weight) < 0) ?? CHEST_LOOT.rolls.at(-1);
  return { gold: randomInt(CHEST_LOOT.gold, random), items: entry.pick(random) };
}

function randomInt([min, max], random) {
  return min + Math.floor(random() * (max - min + 1));
}
