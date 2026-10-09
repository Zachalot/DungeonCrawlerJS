import { CHUNK_SIZE, ROCK_DENSITY, TREE_DENSITY, ZOMBIE_SPAWN_DENSITY } from "../config.js";
import { Purpose, hash, hashFloat } from "../rng.js";
import { dungeonForTile } from "./dungeons.js";
import { Tile } from "./tiles.js";
import { bufferTile, isInVillage, isInVillageBuffer, villageTile } from "./village.js";

/**
 * Returns the tile at a world coordinate. Pure: depends only on (seed, tx, ty).
 */
export function generateTile(seed, tx, ty) {
  if (isInVillage(tx, ty)) return villageTile(tx, ty);
  if (isInVillageBuffer(tx, ty)) return bufferTile(tx, ty);

  const entrance = dungeonForTile(seed, tx, ty);
  if (entrance) {
    if (tx === entrance.tx && ty === entrance.ty) return Tile.DUNGEON_ENTRANCE;
    if (Math.abs(tx - entrance.tx) <= 1 && Math.abs(ty - entrance.ty) <= 1) return Tile.GRASS;
  }

  const r = hashFloat(seed, tx, ty, Purpose.TERRAIN);
  if (r < ROCK_DENSITY) return Tile.ROCK;
  if (r < ROCK_DENSITY + TREE_DENSITY) return Tile.TREE;
  return Tile.GRASS;
}

/** True if an overworld tile hosts an enemy spawn point. */
export function isSpawnPoint(seed, tx, ty, tile) {
  return tile === Tile.GRASS && !isInVillageBuffer(tx, ty) && hashFloat(seed, tx, ty, Purpose.SPAWN) < ZOMBIE_SPAWN_DENSITY;
}

/**
 * Returns a CHUNK_SIZE² block of tiles, per-tile visual variants (0–255), and
 * the dungeon entrances and enemy spawn points it contains.
 * Pure: depends only on (seed, chunkX, chunkY).
 */
export function generateChunk(seed, chunkX, chunkY) {
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  const variants = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  const dungeons = [];
  const spawns = [];
  const originX = chunkX * CHUNK_SIZE;
  const originY = chunkY * CHUNK_SIZE;

  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const tx = originX + lx;
      const ty = originY + ly;
      const i = ly * CHUNK_SIZE + lx;
      tiles[i] = generateTile(seed, tx, ty);
      variants[i] = hash(seed, tx, ty, Purpose.VARIANT) & 0xff;
      if (tiles[i] === Tile.DUNGEON_ENTRANCE) dungeons.push(dungeonForTile(seed, tx, ty));
      if (isSpawnPoint(seed, tx, ty, tiles[i])) spawns.push({ id: `${tx},${ty}`, tx, ty });
    }
  }
  return { chunkX, chunkY, tiles, variants, dungeons, spawns };
}
