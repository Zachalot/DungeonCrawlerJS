import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { WORLD_SIZE } from "../js/config.js";
import { Tile } from "../js/world/tiles.js";
import { dungeonForCell, dungeonsInRect } from "../js/world/dungeons.js";
import { TILE_COLORS, mapWindow } from "../js/ui/maps.js";

describe("mapWindow", () => {
  it("centers on the player away from edges", () => {
    assert.deepEqual(mapWindow(200, 200, WORLD_SIZE, WORLD_SIZE, 80), { x: 160, y: 160, size: 80 });
  });

  it("clamps to the area near edges", () => {
    assert.deepEqual(mapWindow(5, 395, WORLD_SIZE, WORLD_SIZE, 80), { x: 0, y: 320, size: 80 });
  });

  it("centers an area smaller than the window", () => {
    assert.deepEqual(mapWindow(30, 30, 60, 60, 80), { x: -10, y: -10, size: 80 });
  });
});

describe("TILE_COLORS", () => {
  it("has a color for every tile type", () => {
    for (const [name, id] of Object.entries(Tile)) assert.ok(TILE_COLORS[id], `no map color for ${name}`);
  });
});

describe("dungeonsInRect", () => {
  it("returns exactly the entrances whose cells overlap the rect", () => {
    const all = dungeonsInRect(42, 0, 0, WORLD_SIZE - 1, WORLD_SIZE - 1);
    assert.equal(all.length, 64);
    const corner = dungeonsInRect(42, 0, 0, 49, 49);
    assert.deepEqual(corner, [dungeonForCell(42, 0, 0)]);
    assert.equal(dungeonsInRect(42, 40, 40, 60, 60).length, 4, "touches four cells");
  });
});
