import {
  BOSS_FROM_LEVEL,
  DUNGEON_LEVEL_DISTANCE,
  ENEMY_DAMAGE_GROWTH,
  ENEMY_HP_GROWTH,
  RUNE_EXTRA_CHANCES,
  WALL_DAMAGE_STEPS,
  WALL_HP_STEPS,
  WALL_LEVELS,
  XP_FALLOFF,
  XP_FLOOR,
} from "../config.js";
import { ENEMIES } from "../data/enemies.js";
import { VILLAGE_CENTER_TILE } from "../world/village.js";

/** Product of the wall steps an enemy of `level` has passed (levels 17, 33, 49, …). */
export function wallFactor(steps, level) {
  const walls = Math.floor((level - 1) / WALL_LEVELS);
  let factor = 1;
  for (let i = 0; i < walls; i++) factor *= steps[i] ?? steps.at(-1);
  return factor;
}

const cache = new Map();

/** An enemy definition scaled to `level` (hp, damage, xp), cached and frozen. */
export function enemyAtLevel(id, level) {
  const key = `${id}:${level}`;
  let def = cache.get(key);
  if (!def) {
    const base = ENEMIES[id];
    def = Object.freeze({
      ...base,
      level,
      hp: Math.round(base.hp * (1 + ENEMY_HP_GROWTH * (level - 1)) * wallFactor(WALL_HP_STEPS, level)),
      damage: base.damage * (1 + ENEMY_DAMAGE_GROWTH * (level - 1)) * wallFactor(WALL_DAMAGE_STEPS, level),
      xp: base.xp * level,
    });
    cache.set(key, def);
  }
  return def;
}

/** Enemy and dungeon level at an overworld tile: 1 near the village, +1 every DUNGEON_LEVEL_DISTANCE tiles. */
export function levelAt(tx, ty) {
  return 1 + Math.floor(Math.hypot(tx + 0.5 - VILLAGE_CENTER_TILE, ty + 0.5 - VILLAGE_CENTER_TILE) / DUNGEON_LEVEL_DISTANCE);
}

/** Share of an enemy's XP a player earns: less against weaker enemies, never below XP_FLOOR. */
export function xpScale(playerLevel, enemyLevel) {
  return Math.max(XP_FLOOR, 1 - XP_FALLOFF * Math.max(0, playerLevel - enemyLevel));
}

/** Expected runes from a boss of `level`: 1, +1 more every 5 levels, with chances in between. */
export function runesPerBoss(level) {
  if (level < BOSS_FROM_LEVEL) return 0;
  const k = level - BOSS_FROM_LEVEL;
  return 1 + Math.floor(k / 5) + RUNE_EXTRA_CHANCES[k % 5];
}

/** Rolls how many runes a boss of `level` drops. */
export function rollRuneCount(level, random) {
  if (level < BOSS_FROM_LEVEL) return 0;
  const k = level - BOSS_FROM_LEVEL;
  return 1 + Math.floor(k / 5) + (random() < RUNE_EXTRA_CHANCES[k % 5] ? 1 : 0);
}

/** Regular enemy types that can appear at `level`. */
export function typesAtLevel(level, ids) {
  return ids.filter((id) => ENEMIES[id].from <= level);
}
