import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { WORLD_SIZE } from "../js/config.js";
import { Tile } from "../js/world/tiles.js";
import { dungeonForCell, dungeonsInRect } from "../js/world/dungeons.js";
import { TILE_COLORS, centeredView, clampView, fitScale, zoomAt } from "../js/ui/maps.js";

const world = { w: WORLD_SIZE, h: WORLD_SIZE };
const close = (a, b) => Math.abs(a - b) < 1e-9;

describe("map view math", () => {
  it("fits the whole area in the view", () => {
    assert.equal(fitScale(800, 600, world), 1.5);
    assert.equal(fitScale(600, 600, { w: 60, h: 60 }), 10);
  });

  it("centers a view on a tile", () => {
    assert.deepEqual(centeredView(200, 200, 4, 160, 160), { x: 180, y: 180, scale: 4, width: 160, height: 160 });
  });

  it("zooms around the cursor, keeping the tile under it in place", () => {
    const view = centeredView(200, 200, 4, 800, 600);
    const px = 100;
    const py = 450;
    const before = [view.x + px / view.scale, view.y + py / view.scale];
    const zoomed = zoomAt(view, 2, px, py, 1, 16);
    assert.equal(zoomed.scale, 8);
    assert.ok(close(zoomed.x + px / zoomed.scale, before[0]) && close(zoomed.y + py / zoomed.scale, before[1]));
  });

  it("clamps zoom to the limits", () => {
    const view = centeredView(200, 200, 12, 800, 600);
    assert.equal(zoomAt(view, 10, 0, 0, 1.5, 16).scale, 16);
    assert.equal(zoomAt(view, 0.01, 0, 0, 1.5, 16).scale, 1.5);
  });

  it("keeps the view's center inside the area when panning", () => {
    const farOff = { x: -500, y: 900, scale: 4, width: 800, height: 600 };
    const clamped = clampView(farOff, world);
    assert.deepEqual([clamped.x + 100, clamped.y + 75], [0, WORLD_SIZE]);
    const inside = centeredView(150, 150, 4, 800, 600);
    assert.deepEqual(clampView(inside, world), inside);
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
