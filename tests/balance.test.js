import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ENEMIES, NORMAL_ENEMIES } from "../js/data/enemies.js";
import { enemyAtLevel } from "../js/systems/scaling.js";
import { BUILDS, P, enemyStats, fight, runesPerBoss, simulate } from "../tools/balance.js";

const QUICK = { maxDungeons: 1000 }; // builds that can't break a wall would otherwise run to 20,000

// Keeps tools/balance.js honest: it must keep running against the game's real formulas.
describe("balance simulation", () => {
  it("starts enemies at the game's level 1 zombie", () => {
    const { hp, damage, xp } = enemyStats("zombie", 1);
    assert.deepEqual([hp, damage, xp], [ENEMIES.zombie.hp, ENEMIES.zombie.damage, ENEMIES.zombie.xp]);
  });

  it("scales every enemy type exactly as the game does", () => {
    for (const id of NORMAL_ENEMIES) {
      for (const level of [1, 4, 16, 17, 33, 50]) {
        const model = enemyStats(id, level);
        const game = enemyAtLevel(id, level);
        assert.equal(Math.round(model.hp), game.hp, `${id} hp at level ${level}`);
        assert.ok(Math.abs(model.damage - game.damage) < 1e-9, `${id} damage at level ${level}`);
        assert.equal(model.xp, game.xp, `${id} xp at level ${level}`);
      }
    }
  });

  it("matches a fresh character's real sword damage and HP", () => {
    const result = fight(BUILDS.warrior, 1, 0, "zombie", 1);
    assert.deepEqual([result.damage, result.hp, result.hits], [5, 50, 2]);
  });

  it("follows the planned rune drop curve", () => {
    assert.deepEqual([4, 5, 6, 7, 8, 9, 10].map(runesPerBoss), [0, 1, 1.15, 1.35, 1.6, 1.85, 2]);
  });

  it("steps enemy HP up at each wall", () => {
    const before = enemyStats("zombie", P.tierSize).hp;
    const after = enemyStats("zombie", P.tierSize + 1).hp;
    assert.ok(after / before > P.tierHpSteps[0]);
  });

  // Design goals from the enchanting plan; a failure here means the numbers in P drifted.
  it("gives a warrior a table and runes before the first wall, which then breaks quickly", () => {
    const wall = simulate(BUILDS.warrior, 50).walls.find((w) => w.wall === P.tierSize + 1);
    assert.ok(wall.tableAtArrival >= 1, "enchanting table built by the first wall");
    assert.ok(wall.runesInHand >= 1, "at least one rune found by the first wall");
    assert.ok(wall.bosses <= 6, `first wall is a short teaching wall (took ${wall.bosses} bosses)`);
  });

  it("stops pure ranged builds at the first wall: they have to put points in Strength", () => {
    for (const name of ["archer", "mage"]) {
      const wall = simulate(BUILDS[name], 20, QUICK).walls[0];
      assert.ok(wall.unbroken, `${name} broke the first wall without Strength`);
    }
  });

  it("plays every build to level 20 without errors", () => {
    for (const build of Object.values(BUILDS)) {
      const { rows } = simulate(build, 20, QUICK);
      assert.equal(rows.at(-1).level, 20);
    }
  });
});
