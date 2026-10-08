import { WORLD_SIZE } from "../config.js";

// The only place the fixed POC world size is enforced. For an endless world,
// make isInsideWorld return true and isBorder return false.

/** True if a tile lies within the fixed world. */
export function isInsideWorld(tx, ty) {
  return tx >= 0 && ty >= 0 && tx < WORLD_SIZE && ty < WORLD_SIZE;
}

/** True for the impassable edge ring and anything beyond it. */
export function isBorder(tx, ty) {
  return tx <= 0 || ty <= 0 || tx >= WORLD_SIZE - 1 || ty >= WORLD_SIZE - 1;
}
