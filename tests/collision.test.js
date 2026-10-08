import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TILE_SIZE } from "../js/config.js";
import { Player } from "../js/entities/player.js";
import { moveAndCollide, overlapsSolid } from "../js/world/collision.js";

const T = TILE_SIZE;

/** Minimal world: solid tiles listed as "x,y" strings; everything else open. */
function fakeWorld(solids) {
  const set = new Set(solids);
  return { isSolidAt: (tx, ty) => set.has(`${tx},${ty}`) };
}

describe("moveAndCollide", () => {
  it("moves freely in open space", () => {
    const body = { x: 5 * T, y: 5 * T, half: 10 };
    moveAndCollide(fakeWorld([]), body, 7, -3);
    assert.deepEqual([body.x, body.y], [5 * T + 7, 5 * T - 3]);
  });

  it("stops flush against a wall on each side", () => {
    const world = fakeWorld(["6,5", "4,5", "5,6", "5,4"]);
    const cases = [
      [20, 0, (b) => assert.equal(b.x + b.half, 6 * T)],
      [-20, 0, (b) => assert.equal(b.x - b.half, 5 * T)],
      [0, 20, (b) => assert.equal(b.y + b.half, 6 * T)],
      [0, -20, (b) => assert.equal(b.y - b.half, 5 * T)],
    ];
    for (const [dx, dy, check] of cases) {
      const body = { x: 5.5 * T, y: 5.5 * T, half: 10 };
      moveAndCollide(world, body, dx, dy);
      check(body);
      assert.equal(overlapsSolid(world, body), false);
    }
  });

  it("slides along a wall when moving diagonally", () => {
    const world = fakeWorld(["6,4", "6,5", "6,6"]);
    const body = { x: 5.5 * T, y: 5.5 * T, half: 10 };
    moveAndCollide(world, body, 20, 8);
    assert.equal(body.x + body.half, 6 * T);
    assert.equal(body.y, 5.5 * T + 8);
  });
});

describe("Player.update", () => {
  it("normalizes diagonal movement to the same speed", () => {
    const world = fakeWorld([]);
    const straight = new Player(100 * T, 100 * T);
    const diagonal = new Player(100 * T, 100 * T);
    straight.update(1, { x: 1, y: 0 }, { x: 0, y: 0 }, world);
    diagonal.update(1, { x: 1, y: 1 }, { x: 0, y: 0 }, world);
    const d1 = Math.hypot(straight.x - 100 * T, straight.y - 100 * T);
    const d2 = Math.hypot(diagonal.x - 100 * T, diagonal.y - 100 * T);
    assert.ok(Math.abs(d1 - d2) < 1e-9);
  });

  it("keeps the previous position for render interpolation", () => {
    const player = new Player(10 * T, 10 * T);
    player.update(0.1, { x: 1, y: 0 }, { x: 0, y: 0 }, fakeWorld([]));
    const mid = player.renderPosition(0.5);
    assert.equal(mid.x, (player.prevX + player.x) / 2);
  });
});
