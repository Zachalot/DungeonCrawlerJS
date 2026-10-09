export const Tile = Object.freeze({
  GRASS: 0,
  PATH: 1,
  ROCK: 2,
  TREE: 3,
  VILLAGE_FLOOR: 4,
  VILLAGE_WALL: 5,
  DUNGEON_ENTRANCE: 6,
  DUNGEON_FLOOR: 8,
  DUNGEON_WALL: 9,
  EXIT_PORTAL: 10,
  STAIRS_DOWN: 11,
  STAIRS_UP: 12,
});

const SOLID = new Set([Tile.ROCK, Tile.TREE, Tile.VILLAGE_WALL, Tile.DUNGEON_WALL]);

/** Trees and rocks can be harvested for wood and stone. */
export function isHarvestable(tile) {
  return tile === Tile.TREE || tile === Tile.ROCK;
}

/** True if the tile blocks movement and projectiles. */
export function isSolid(tile) {
  return SOLID.has(tile);
}
