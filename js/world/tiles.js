export const Tile = Object.freeze({
  GRASS: 0,
  PATH: 1,
  ROCK: 2,
  TREE: 3,
  VILLAGE_FLOOR: 4,
  VILLAGE_WALL: 5,
  DUNGEON_ENTRANCE: 6,
  BORDER: 7, // impassable world edge
});

const SOLID = new Set([Tile.ROCK, Tile.TREE, Tile.VILLAGE_WALL, Tile.BORDER]);

/** True if the tile blocks movement (and, from M2, projectiles). */
export function isSolid(tile) {
  return SOLID.has(tile);
}
