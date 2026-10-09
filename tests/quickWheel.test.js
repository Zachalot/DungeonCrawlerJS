import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { QUICK_WHEEL_ITEMS } from "../js/data/items.js";
import { clampCenter, pickSegment } from "../js/ui/quickWheel.js";

describe("pickSegment", () => {
  it("cancels inside the dead zone", () => {
    assert.equal(pickSegment(0, 0, 4), null);
    assert.equal(pickSegment(20, -20, 4, 42), null);
  });

  it("numbers segments clockwise from the top", () => {
    const far = 100;
    assert.deepEqual(
      [pickSegment(0, -far, 4), pickSegment(far, 0, 4), pickSegment(0, far, 4), pickSegment(-far, 0, 4)],
      [0, 1, 2, 3],
    );
  });

  it("splits segments halfway between their centers, wrapping past the top", () => {
    const at = (degrees) => pickSegment(Math.sin((degrees * Math.PI) / 180) * 100, -Math.cos((degrees * Math.PI) / 180) * 100, 4);
    assert.equal(at(44), 0);
    assert.equal(at(46), 1);
    assert.equal(at(359), 0);
    assert.equal(at(-44), 0);
    assert.equal(at(-46), 3);
  });

  it("covers every wheel item", () => {
    const hit = new Set();
    for (let d = 0; d < 360; d += 5) {
      hit.add(pickSegment(Math.sin((d * Math.PI) / 180) * 100, -Math.cos((d * Math.PI) / 180) * 100, QUICK_WHEEL_ITEMS.length));
    }
    assert.equal(hit.size, QUICK_WHEEL_ITEMS.length);
  });
});

describe("clampCenter", () => {
  it("keeps the wheel on screen near edges and leaves the middle alone", () => {
    assert.deepEqual(clampCenter(10, 700, 1280, 720, 130), { x: 130, y: 590 });
    assert.deepEqual(clampCenter(640, 360, 1280, 720, 130), { x: 640, y: 360 });
  });

  it("centers on screens too small for the wheel", () => {
    assert.deepEqual(clampCenter(10, 10, 200, 720, 130), { x: 100, y: 130 });
  });
});
