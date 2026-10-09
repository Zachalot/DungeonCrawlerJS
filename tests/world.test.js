import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CHUNK_SIZE, DUNGEON_CELL_SIZE, DUNGEON_MIN_VILLAGE_DISTANCE, TILE_SIZE, WORLD_SIZE } from "../js/config.js";
import { hash } from "../js/rng.js";
import { generateChunk } from "../js/world/chunks.js";
import { dungeonForCell } from "../js/world/dungeons.js";
import { Tile, isSolid } from "../js/world/tiles.js";
import { VILLAGE_CENTER_TILE, VILLAGE_ORIGIN, VILLAGE_SPAWN, isInVillageBuffer } from "../js/world/village.js";
import { World } from "../js/world/world.js";

const SEEDS = [1, 42, 1234567, 4294967295];
const CELLS = WORLD_SIZE / DUNGEON_CELL_SIZE;

describe("rng.hash", () => {
  it("is deterministic and sensitive to every input", () => {
    assert.equal(hash(1, 2, 3), hash(1, 2, 3));
    assert.notEqual(hash(1, 2, 3), hash(1, 2, 4));
    assert.notEqual(hash(1, 2, 3), hash(1, 3, 2));
    assert.notEqual(hash(-1, 0), hash(1, 0));
  });
});

describe("generateChunk", () => {
  it("produces identical chunks regardless of generation order", () => {
    const a = new World(42);
    const b = new World(42);
    a.getChunk(0, 0);
    a.getChunk(6, 6);
    b.getChunk(6, 6);
    b.getChunk(0, 0);
    assert.deepEqual(a.getChunk(6, 6).tiles, b.getChunk(6, 6).tiles);
    assert.deepEqual(a.getChunk(0, 0).tiles, generateChunk(42, 0, 0).tiles);
  });

  it("differs between seeds", () => {
    assert.notDeepEqual(generateChunk(1, 3, 3).tiles, generateChunk(2, 3, 3).tiles);
  });

  it("fills tiles outside the world with border", () => {
    const outside = generateChunk(42, -1, -1);
    assert.ok(outside.tiles.every((t) => t === Tile.BORDER));
  });
});

describe("village", () => {
  const world = new World(42);

  it("has open gates in the middle of each wall and solid corners", () => {
    const end = VILLAGE_ORIGIN + 11;
    const mid = VILLAGE_CENTER_TILE;
    for (const [tx, ty] of [[mid, VILLAGE_ORIGIN], [mid, end], [VILLAGE_ORIGIN, mid], [end, mid]]) {
      assert.equal(world.isSolidAt(tx, ty), false, `gate at ${tx},${ty}`);
    }
    for (const [tx, ty] of [[VILLAGE_ORIGIN, VILLAGE_ORIGIN], [end, end]]) {
      assert.equal(world.getTile(tx, ty), Tile.VILLAGE_WALL);
    }
  });

  it("spawns the player on walkable floor", () => {
    const tx = Math.floor(VILLAGE_SPAWN.x / TILE_SIZE);
    const ty = Math.floor(VILLAGE_SPAWN.y / TILE_SIZE);
    assert.equal(world.getTile(tx, ty), Tile.VILLAGE_FLOOR);
  });

  it("keeps the buffer ring free of obstacles", () => {
    for (let ty = VILLAGE_ORIGIN - 5; ty < VILLAGE_ORIGIN + 17; ty++) {
      for (let tx = VILLAGE_ORIGIN - 5; tx < VILLAGE_ORIGIN + 17; tx++) {
        if (!isInVillageBuffer(tx, ty)) continue;
        const tile = world.getTile(tx, ty);
        assert.ok(tile !== Tile.ROCK && tile !== Tile.TREE, `obstacle at ${tx},${ty}`);
      }
    }
  });
});

describe("dungeon placement", () => {
  for (const seed of SEEDS) {
    it(`places at most one clear entrance per cell, away from the village (seed ${seed})`, () => {
      const world = new World(seed);
      let count = 0;
      for (let cy = 0; cy < CELLS; cy++) {
        for (let cx = 0; cx < CELLS; cx++) {
          const d = dungeonForCell(seed, cx, cy);
          if (!d) continue;
          count++;
          assert.equal(Math.floor(d.tx / DUNGEON_CELL_SIZE), cx);
          assert.equal(Math.floor(d.ty / DUNGEON_CELL_SIZE), cy);
          assert.equal(world.getTile(d.tx, d.ty), Tile.DUNGEON_ENTRANCE);
          const distance = Math.max(Math.abs(d.tx + 0.5 - VILLAGE_CENTER_TILE), Math.abs(d.ty + 0.5 - VILLAGE_CENTER_TILE));
          assert.ok(distance >= DUNGEON_MIN_VILLAGE_DISTANCE);
          assert.ok(d.level >= 1);
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) assert.equal(world.isSolidAt(d.tx + ox, d.ty + oy), false);
          }
        }
      }
      assert.ok(count >= CELLS * CELLS - 4, `expected ~${CELLS * CELLS} dungeons, got ${count}`);
    });

    it(`lists every entrance in exactly one chunk (seed ${seed})`, () => {
      const world = new World(seed);
      const chunks = Math.ceil(WORLD_SIZE / CHUNK_SIZE);
      const ids = [];
      for (let cy = 0; cy < chunks; cy++) {
        for (let cx = 0; cx < chunks; cx++) ids.push(...world.getChunk(cx, cy).dungeons.map((d) => d.id));
      }
      assert.equal(new Set(ids).size, ids.length);
    });
  }
});

describe("world border", () => {
  it("is solid on every edge and beyond", () => {
    const world = new World(42);
    for (let i = 0; i < WORLD_SIZE; i += 37) {
      assert.ok(world.isSolidAt(0, i));
      assert.ok(world.isSolidAt(WORLD_SIZE - 1, i));
      assert.ok(world.isSolidAt(i, 0));
      assert.ok(world.isSolidAt(i, WORLD_SIZE - 1));
    }
    assert.ok(world.isSolidAt(-5, 10));
    assert.ok(world.isSolidAt(WORLD_SIZE + 5, 10));
  });
});

describe("reachability", () => {
  for (const seed of SEEDS) {
    it(`connects every dungeon entrance to the village spawn (seed ${seed})`, () => {
      const world = new World(seed);
      const visited = new Uint8Array(WORLD_SIZE * WORLD_SIZE);
      const start = [Math.floor(VILLAGE_SPAWN.x / TILE_SIZE), Math.floor(VILLAGE_SPAWN.y / TILE_SIZE)];
      const queue = [start];
      visited[start[1] * WORLD_SIZE + start[0]] = 1;
      while (queue.length) {
        const [x, y] = queue.pop();
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          const i = ny * WORLD_SIZE + nx;
          if (visited[i] || world.isSolidAt(nx, ny)) continue;
          visited[i] = 1;
          queue.push([nx, ny]);
        }
      }
      for (let cy = 0; cy < CELLS; cy++) {
        for (let cx = 0; cx < CELLS; cx++) {
          const d = dungeonForCell(seed, cx, cy);
          if (d) assert.ok(visited[d.ty * WORLD_SIZE + d.tx], `dungeon ${d.id} unreachable`);
        }
      }
    });
  }
});

describe("solid tiles", () => {
  it("blocks rocks, trees, walls, and border only", () => {
    assert.deepEqual(
      Object.entries(Tile).filter(([, t]) => isSolid(t)).map(([name]) => name).sort(),
      ["BORDER", "DUNGEON_WALL", "ROCK", "TREE", "VILLAGE_WALL"],
    );
  });
});
