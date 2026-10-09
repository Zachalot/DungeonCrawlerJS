import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { QUICK_WHEEL_KINDS, potionId } from "../js/data/items.js";
import { Player } from "../js/entities/player.js";
import { cycleWheelLevel, potionLevels, wheelPotion } from "../js/systems/consumables.js";
import { addItem, takeItem } from "../js/systems/inventory.js";
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
      hit.add(pickSegment(Math.sin((d * Math.PI) / 180) * 100, -Math.cos((d * Math.PI) / 180) * 100, QUICK_WHEEL_KINDS.length));
    }
    assert.equal(hit.size, QUICK_WHEEL_KINDS.length);
  });
});

describe("wheel potion levels", () => {
  function playerWith(levels) {
    const player = new Player(0, 0);
    let uid = 0;
    for (const level of levels) addItem(player.inventory, potionId("hp", level), 2, () => `u${uid++}`);
    return player;
  }

  it("uses the highest level carried until the player picks one", () => {
    const player = playerWith([1, 4, 2]);
    assert.deepEqual(potionLevels(player.inventory, "hp").map((p) => p.level), [4, 2, 1]);
    assert.equal(wheelPotion(player, "hp"), potionId("hp", 4));
    assert.equal(wheelPotion(player, "mana"), null, "carries none");
  });

  it("scrolls through the levels carried, remembers the pick, and falls back when it runs out", () => {
    const player = playerWith([1, 4, 2]);
    assert.equal(cycleWheelLevel(player, "hp", 1), 1, "from 4, +1 wraps to the lowest");
    assert.equal(cycleWheelLevel(player, "hp", 1), 2);
    assert.equal(wheelPotion(player, "hp"), potionId("hp", 2));
    takeItem(player.inventory, potionId("hp", 2), 2);
    assert.equal(wheelPotion(player, "hp"), potionId("hp", 4), "picked level gone: highest again");
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
