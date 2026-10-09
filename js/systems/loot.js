import { BOSS_GOLD_PER_LEVEL, MAX_ARROWS } from "../config.js";
import { DROP_TABLES } from "../data/drops.js";
import { CHEST_LOOT } from "../data/lootTables.js";
import { rollRuneCount } from "./scaling.js";

/**
 * Rolls what an enemy drops: { gold, arrows, materials: { greenGoop: 1 }, runes: { str: 2 } }.
 * `enemy` is a scaled definition (systems/scaling.js): gold scales with its level, and bosses
 * drop runes of their own type.
 */
export function rollDrops(enemy, random = Math.random) {
  const result = { gold: 0, arrows: 0, materials: {}, runes: {} };
  for (const entry of DROP_TABLES[enemy.dropTable] ?? []) {
    if (random() >= entry.chance) continue;
    if (entry.gold) result.gold += randomInt(entry.gold, random) * enemy.level;
    if (entry.arrows) result.arrows += randomInt(entry.arrows, random);
    if (entry.material) result.materials[entry.material] = (result.materials[entry.material] ?? 0) + 1;
  }
  if (enemy.boss) {
    result.gold += BOSS_GOLD_PER_LEVEL * enemy.level;
    result.runes[enemy.rune] = rollRuneCount(enemy.level, random);
  }
  return result;
}

/** Adds rolled drops to the player; arrows are capped by the quiver size. */
export function collectDrops(player, drops) {
  player.gold += drops.gold;
  player.arrows = Math.min(MAX_ARROWS, player.arrows + drops.arrows);
  for (const [id, n] of Object.entries(drops.materials ?? {})) player.materials[id] += n;
  for (const [id, n] of Object.entries(drops.runes ?? {})) player.runes[id] += n;
}

/**
 * Rolls a dungeon chest of `level`: { gold, items: [{ defId, qty } | { arrows }] }. A chest
 * opened after killing the dungeon's boss gets twice the gold and two rolls.
 */
export function rollChestLoot(level, random = Math.random, { boss = false } = {}) {
  const total = CHEST_LOOT.rolls.reduce((sum, r) => sum + r.weight, 0);
  const items = [];
  for (let n = 0; n < (boss ? 2 : 1); n++) {
    let roll = random() * total;
    const entry = CHEST_LOOT.rolls.find((r) => (roll -= r.weight) < 0) ?? CHEST_LOOT.rolls.at(-1);
    items.push(...entry.pick(random, level));
  }
  return { gold: randomInt(CHEST_LOOT.gold, random) * level * (boss ? 2 : 1), items };
}

function randomInt([min, max], random) {
  return min + Math.floor(random() * (max - min + 1));
}
