import { MAX_ARROWS } from "../config.js";
import { DROP_TABLES } from "../data/drops.js";

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

function randomInt([min, max], random) {
  return min + Math.floor(random() * (max - min + 1));
}
