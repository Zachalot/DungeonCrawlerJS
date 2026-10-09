import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CHUNK_SIZE, DUNGEON_CELL_SIZE, DUNGEON_LEVEL_DISTANCE, DUNGEON_MIN_VILLAGE_DISTANCE, TILE_SIZE, WORLD_SIZE } from "../js/config.js";
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

  it("keeps generating normal terrain beyond the starting square, negative coordinates too", () => {
    for (const [cx, cy] of [[-1, -1], [-40, 3], [200, 200]]) {
      const chunk = generateChunk(42, cx, cy);
      assert.ok(chunk.tiles.some((t) => t === Tile.GRASS), `chunk ${cx},${cy}`);
      assert.ok(chunk.tiles.some((t) => t === Tile.TREE || t === Tile.ROCK));
    }
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

describe("endless world", () => {
  it("has no border: dungeons keep appearing, and get higher-level farther out", () => {
    const far = 20 * DUNGEON_LEVEL_DISTANCE;
    const cx = Math.floor((VILLAGE_CENTER_TILE + far) / DUNGEON_CELL_SIZE);
    const levels = [];
    for (let cy = -2; cy < 4; cy++) {
      const d = dungeonForCell(42, cx, Math.floor(VILLAGE_CENTER_TILE / DUNGEON_CELL_SIZE) + cy);
      if (d) levels.push(d.level);
    }
    assert.ok(levels.length > 0 && levels.every((l) => l >= 20), `levels ${levels}`);
    const west = dungeonForCell(42, -30, 4);
    assert.ok(west && west.level > 20, "negative coordinates work too");
  });

  it("shows harvested trees and rocks as walkable grass, and placed structures as solid", () => {
    const world = new World(42);
    let tree = null;
    for (let tx = 150; !tree; tx++) if (world.getTile(tx, 150) === Tile.TREE) tree = tx;
    assert.ok(world.isSolidAt(tree, 150));
    world.harvested.set(`${tree},150`, 999);
    assert.equal(world.getTile(tree, 150), Tile.GRASS);
    assert.ok(!world.isSolidAt(tree, 150));
    world.structureTiles = new Set(["200,200"]);
    assert.ok(world.isSolidAt(200, 200));
  });
});

describe("reachability", () => {
  for (const seed of SEEDS) {
    // Searches the starting square only: the world beyond it is endless.
    it(`connects every dungeon entrance near the village to the village spawn (seed ${seed})`, () => {
      const world = new World(seed);
      const visited = new Uint8Array(WORLD_SIZE * WORLD_SIZE);
      const outside = (x, y) => x < 0 || y < 0 || x >= WORLD_SIZE || y >= WORLD_SIZE;
      const start = [Math.floor(VILLAGE_SPAWN.x / TILE_SIZE), Math.floor(VILLAGE_SPAWN.y / TILE_SIZE)];
      const queue = [start];
      visited[start[1] * WORLD_SIZE + start[0]] = 1;
      while (queue.length) {
        const [x, y] = queue.pop();
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          const i = ny * WORLD_SIZE + nx;
          if (outside(nx, ny) || visited[i] || world.isSolidAt(nx, ny)) continue;
          visited[i] = 1;
          queue.push([nx, ny]);
        }
      }
      for (let cy = 0; cy < CELLS; cy++) {
        for (let cx = 0; cx < CELLS; cx++) {
          const d = dungeonForCell(seed, cx, cy);
          // Edge cells can be walled in by the square's edge yet reachable from beyond it.
          const inner = cx > 0 && cy > 0 && cx < CELLS - 1 && cy < CELLS - 1;
          if (d && inner) assert.ok(visited[d.ty * WORLD_SIZE + d.tx], `dungeon ${d.id} unreachable`);
        }
      }
    });
  }
});

describe("solid tiles", () => {
  it("blocks rocks, trees, and walls only", () => {
    assert.deepEqual(
      Object.entries(Tile).filter(([, t]) => isSolid(t)).map(([name]) => name).sort(),
      ["DUNGEON_WALL", "ROCK", "TREE", "VILLAGE_WALL"],
    );
  });
});
