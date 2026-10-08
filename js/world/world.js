import { CHUNK_SIZE } from "../config.js";
import { generateChunk } from "./chunks.js";
import { isSolid } from "./tiles.js";
import { isInVillage } from "./village.js";

/** Overworld tile access backed by lazily generated, cached chunks. */
export class World {
  constructor(seed) {
    this.seed = seed;
    this.chunks = new Map();
  }

  getChunk(chunkX, chunkY) {
    const key = `${chunkX},${chunkY}`;
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = generateChunk(this.seed, chunkX, chunkY);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  /** Returns { tile, variant } at a tile coordinate. */
  getTileInfo(tx, ty) {
    const chunk = this.getChunk(Math.floor(tx / CHUNK_SIZE), Math.floor(ty / CHUNK_SIZE));
    const lx = tx - chunk.chunkX * CHUNK_SIZE;
    const ly = ty - chunk.chunkY * CHUNK_SIZE;
    const i = ly * CHUNK_SIZE + lx;
    return { tile: chunk.tiles[i], variant: chunk.variants[i] };
  }

  getTile(tx, ty) {
    return this.getTileInfo(tx, ty).tile;
  }

  isSolidAt(tx, ty) {
    return isSolid(this.getTile(tx, ty));
  }

  isSafeZone(tx, ty) {
    return isInVillage(tx, ty);
  }
}
