import { CHUNK_SIZE } from "../config.js";

const BYTES_PER_CHUNK = (CHUNK_SIZE * CHUNK_SIZE) / 8;

/**
 * Which tiles the player has seen, as one bitset per chunk ("cx,cy" → Uint8Array).
 * Sparse and coordinate-keyed, so it works unchanged for an endless world.
 */
export class Fog {
  constructor() {
    this.chunks = new Map();
    this.version = 0; // bumped on every reveal, so maps know when to redraw
  }

  isExplored(tx, ty) {
    const bits = this.chunks.get(chunkKey(tx, ty));
    if (!bits) return false;
    const i = bitIndex(tx, ty);
    return (bits[i >> 3] & (1 << (i & 7))) !== 0;
  }

  /** Marks every tile within `radius` tiles (a circle) of (cx, cy) as explored. */
  reveal(cx, cy, radius) {
    let changed = false;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        changed = this.mark(cx + dx, cy + dy) || changed;
      }
    }
    if (changed) this.version++;
    return changed;
  }

  /** Marks a rectangle explored (dev panel "reveal map"). */
  revealRect(x0, y0, x1, y1) {
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) this.mark(tx, ty);
    this.version++;
  }

  mark(tx, ty) {
    const key = chunkKey(tx, ty);
    let bits = this.chunks.get(key);
    if (!bits) {
      bits = new Uint8Array(BYTES_PER_CHUNK);
      this.chunks.set(key, bits);
    }
    const i = bitIndex(tx, ty);
    const mask = 1 << (i & 7);
    if (bits[i >> 3] & mask) return false;
    bits[i >> 3] |= mask;
    return true;
  }

  /** Tile rectangle covering every explored chunk: { x0, y0, w, h }, or null if nothing is explored. */
  bounds() {
    if (this.chunks.size === 0) return null;
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const key of this.chunks.keys()) {
      const [cx, cy] = key.split(",").map(Number);
      minX = Math.min(minX, cx);
      minY = Math.min(minY, cy);
      maxX = Math.max(maxX, cx);
      maxY = Math.max(maxY, cy);
    }
    return { x0: minX * CHUNK_SIZE, y0: minY * CHUNK_SIZE, w: (maxX - minX + 1) * CHUNK_SIZE, h: (maxY - minY + 1) * CHUNK_SIZE };
  }

  /** { "cx,cy": base64 } for saving. */
  serialize() {
    const out = {};
    for (const [key, bits] of this.chunks) out[key] = toBase64(bits);
    return out;
  }

  static deserialize(data = {}) {
    const fog = new Fog();
    for (const [key, encoded] of Object.entries(data)) {
      const bits = fromBase64(encoded);
      if (bits.length === BYTES_PER_CHUNK) fog.chunks.set(key, bits);
    }
    return fog;
  }
}

function chunkKey(tx, ty) {
  return `${Math.floor(tx / CHUNK_SIZE)},${Math.floor(ty / CHUNK_SIZE)}`;
}

// Bit position of a tile within its chunk (handles negative coordinates).
function bitIndex(tx, ty) {
  const lx = ((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const ly = ((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return ly * CHUNK_SIZE + lx;
}

function toBase64(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(text) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
