export const Tile = Object.freeze({
  GRASS: 0,
  PATH: 1,
  ROCK: 2,
  TREE: 3,
  VILLAGE_FLOOR: 4,
  VILLAGE_WALL: 5,
  DUNGEON_ENTRANCE: 6,
  BORDER: 7, // impassable world edge
  DUNGEON_FLOOR: 8,
  DUNGEON_WALL: 9,
  EXIT_PORTAL: 10,
});

const SOLID = new Set([Tile.ROCK, Tile.TREE, Tile.VILLAGE_WALL, Tile.BORDER, Tile.DUNGEON_WALL]);

/** True if the tile blocks movement and projectiles. */
export function isSolid(tile) {
  return SOLID.has(tile);
}
