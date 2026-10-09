import { DUNGEON_CELL_MARGIN, DUNGEON_CELL_SIZE, DUNGEON_MIN_VILLAGE_DISTANCE } from "../config.js";
import { Purpose, hashFloat } from "../rng.js";
import { levelAt } from "../systems/scaling.js";
import { VILLAGE_CENTER_TILE } from "./village.js";

/** Returns the dungeon entrance for a dungeon cell, or null if the cell has none (too close to the village). */
export function dungeonForCell(seed, cellX, cellY) {
  const span = DUNGEON_CELL_SIZE - 2 * DUNGEON_CELL_MARGIN;
  const tx = cellX * DUNGEON_CELL_SIZE + DUNGEON_CELL_MARGIN + Math.floor(hashFloat(seed, cellX, cellY, Purpose.DUNGEON_X) * span);
  const ty = cellY * DUNGEON_CELL_SIZE + DUNGEON_CELL_MARGIN + Math.floor(hashFloat(seed, cellX, cellY, Purpose.DUNGEON_Y) * span);

  const dx = tx + 0.5 - VILLAGE_CENTER_TILE;
  const dy = ty + 0.5 - VILLAGE_CENTER_TILE;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < DUNGEON_MIN_VILLAGE_DISTANCE) return null;

  return { id: `${cellX}_${cellY}`, tx, ty, level: levelAt(tx, ty) };
}

/** Every dungeon entrance whose cell overlaps the tile rectangle [x0, x1] × [y0, y1]. */
export function dungeonsInRect(seed, x0, y0, x1, y1) {
  const list = [];
  for (let cy = Math.floor(y0 / DUNGEON_CELL_SIZE); cy <= Math.floor(y1 / DUNGEON_CELL_SIZE); cy++) {
    for (let cx = Math.floor(x0 / DUNGEON_CELL_SIZE); cx <= Math.floor(x1 / DUNGEON_CELL_SIZE); cx++) {
      const entrance = dungeonForCell(seed, cx, cy);
      if (entrance) list.push(entrance);
    }
  }
  return list;
}

/** Returns the dungeon entrance of the cell containing a tile, or null. */
export function dungeonForTile(seed, tx, ty) {
  return dungeonForCell(seed, Math.floor(tx / DUNGEON_CELL_SIZE), Math.floor(ty / DUNGEON_CELL_SIZE));
}
