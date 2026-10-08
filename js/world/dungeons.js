import {
  DUNGEON_CELL_MARGIN,
  DUNGEON_CELL_SIZE,
  DUNGEON_LEVEL_DISTANCE,
  DUNGEON_MIN_VILLAGE_DISTANCE,
} from "../config.js";
import { Purpose, hashFloat } from "../rng.js";
import { VILLAGE_CENTER_TILE } from "./village.js";
import { isInsideWorld } from "./bounds.js";

/**
 * Returns the dungeon entrance for a dungeon cell, or null if the cell has none
 * (too close to the village, or outside the world).
 */
export function dungeonForCell(seed, cellX, cellY) {
  const span = DUNGEON_CELL_SIZE - 2 * DUNGEON_CELL_MARGIN;
  const tx = cellX * DUNGEON_CELL_SIZE + DUNGEON_CELL_MARGIN + Math.floor(hashFloat(seed, cellX, cellY, Purpose.DUNGEON_X) * span);
  const ty = cellY * DUNGEON_CELL_SIZE + DUNGEON_CELL_MARGIN + Math.floor(hashFloat(seed, cellX, cellY, Purpose.DUNGEON_Y) * span);
  if (!isInsideWorld(tx, ty)) return null;

  const dx = tx + 0.5 - VILLAGE_CENTER_TILE;
  const dy = ty + 0.5 - VILLAGE_CENTER_TILE;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < DUNGEON_MIN_VILLAGE_DISTANCE) return null;

  return {
    id: `${cellX}_${cellY}`,
    tx,
    ty,
    level: 1 + Math.floor(Math.hypot(dx, dy) / DUNGEON_LEVEL_DISTANCE),
  };
}

/** Returns the dungeon entrance of the cell containing a tile, or null. */
export function dungeonForTile(seed, tx, ty) {
  return dungeonForCell(seed, Math.floor(tx / DUNGEON_CELL_SIZE), Math.floor(ty / DUNGEON_CELL_SIZE));
}
