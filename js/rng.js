// Seeded randomness. World generation uses hash() on coordinates rather than a
// shared stream, so results don't depend on the order chunks are generated in.

export const Purpose = Object.freeze({
  TERRAIN: 1,
  VARIANT: 2,
  DUNGEON_X: 3,
  DUNGEON_Y: 4,
});

/** Returns a PRNG yielding floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns a well-mixed uint32 for any list of integers (negatives allowed). */
export function hash(...values) {
  let h = 0x9e3779b9;
  for (const v of values) {
    h = Math.imul(h ^ (v | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

/** Returns a float in [0, 1) derived from hash(). */
export function hashFloat(...values) {
  return hash(...values) / 4294967296;
}

export function randomSeed() {
  return Math.floor(Math.random() * 2 ** 32) >>> 0;
}
