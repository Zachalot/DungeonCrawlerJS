import { CHUNK_SIZE } from "../config.js";
import { generateChunk } from "./chunks.js";
import { Tile, isSolid } from "./tiles.js";
import { isInVillage } from "./village.js";

/**
 * The endless overworld: tiles from lazily generated, cached chunks, plus what the player
 * changed: harvested trees and rocks (grass until they regrow) and placed village structures.
 */
export class World {
  constructor(seed) {
    this.kind = "overworld";
    this.endless = true;
    this.seed = seed;
    this.chunks = new Map();
    this.widthPx = Infinity;
    this.heightPx = Infinity;
    this.harvested = new Map(); // "tx,ty" → play time when it regrows
    this.structureTiles = new Set(); // "tx,ty" covered by a placed structure (solid)
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
    const tile = this.harvested.size && this.harvested.has(`${tx},${ty}`) ? Tile.GRASS : chunk.tiles[i];
    return { tile, variant: chunk.variants[i] };
  }

  getTile(tx, ty) {
    return this.getTileInfo(tx, ty).tile;
  }

  isSolidAt(tx, ty) {
    return isSolid(this.getTile(tx, ty)) || this.structureTiles.has(`${tx},${ty}`);
  }

  isSafeZone(tx, ty) {
    return isInVillage(tx, ty);
  }
}
