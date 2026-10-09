import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { INTERACT_RANGE, STARTING_STATS, TILE_SIZE } from "../js/config.js";
import { ENEMIES } from "../js/data/enemies.js";
import { Enemy } from "../js/entities/enemy.js";
import { Player } from "../js/entities/player.js";
import { Game } from "../js/game.js";
import { mulberry32 } from "../js/rng.js";
import { allocatePoints, grantXp, previewStats, respec, respecCost, xpToNext } from "../js/systems/leveling.js";
import { collectDrops, rollDrops } from "../js/systems/loot.js";
import { enemyAtLevel } from "../js/systems/scaling.js";
import { maxHp } from "../js/systems/stats.js";
import { VILLAGE_NPCS } from "../js/world/village.js";

const T = TILE_SIZE;

function newPlayer() {
  return new Player(0, 0);
}

describe("xp and levels", () => {
  it("needs 50 × level × 1.08^(level − 1) XP for the next level", () => {
    assert.deepEqual([1, 2, 3].map(xpToNext), [50, 108, 174]);
  });

  it("gets slower: same-level kills per level climb as you level", () => {
    const killsFor = (level) => xpToNext(level) / enemyAtLevel("zombie", level).xp;
    assert.equal(killsFor(1), 5);
    assert.ok(killsFor(16) > 15 && killsFor(32) > 3 * killsFor(16) * 0.9, `${killsFor(16)} → ${killsFor(32)}`);
  });

  it("levels up after five zombie kills, grants 3 points, and fully heals", () => {
    const player = newPlayer();
    player.hp = 3;
    player.mana = 0;
    for (let i = 0; i < 4; i++) assert.equal(grantXp(player, ENEMIES.zombie.xp), 0);
    assert.equal(grantXp(player, ENEMIES.zombie.xp), 1);
    assert.deepEqual([player.level, player.xp, player.unspentPoints], [2, 0, 3]);
    assert.deepEqual([player.hp, player.mana], [50, 50]);
  });

  it("carries overflow XP and can gain several levels at once", () => {
    const player = newPlayer();
    assert.equal(grantXp(player, 50 + 108 + 20), 2);
    assert.deepEqual([player.level, player.xp, player.unspentPoints], [3, 20, 6]);
  });
});

describe("stat allocation", () => {
  it("previews without mutating", () => {
    const stats = { ...STARTING_STATS };
    assert.deepEqual(previewStats(stats, { end: 2 }), { ...STARTING_STATS, end: 7 });
    assert.deepEqual(stats, STARTING_STATS);
  });

  it("commits points and raises current HP/mana with their maximums", () => {
    const player = newPlayer();
    player.unspentPoints = 3;
    player.hp = 20;
    assert.ok(allocatePoints(player, { end: 2, int: 1 }));
    assert.deepEqual(player.stats, { str: 5, int: 6, dex: 5, end: 7 });
    assert.equal(player.unspentPoints, 0);
    assert.equal(maxHp(player.stats), 70);
    assert.equal(player.hp, 40, "still 30 below max");
    assert.equal(player.mana, 60);
  });

  it("rejects overspending, negatives, fractions, and empty allocations", () => {
    const player = newPlayer();
    player.unspentPoints = 3;
    for (const pending of [{ str: 4 }, { str: -1, dex: 2 }, { str: 1.5 }, {}]) {
      assert.equal(allocatePoints(player, pending), false);
    }
    assert.deepEqual(player.stats, STARTING_STATS);
    assert.equal(player.unspentPoints, 3);
  });
});

describe("respec", () => {
  it("costs 50 g × level and refunds every earned point", () => {
    const player = newPlayer();
    grantXp(player, 50 + 108); // level 3, 6 points
    allocatePoints(player, { str: 6 });
    player.gold = 200;
    assert.equal(respecCost(player.level), 150);
    assert.ok(respec(player));
    assert.deepEqual(player.stats, STARTING_STATS);
    assert.equal(player.unspentPoints, 6);
    assert.equal(player.gold, 50);
  });

  it("refuses when the player can't afford it", () => {
    const player = newPlayer();
    grantXp(player, 50);
    allocatePoints(player, { end: 3 });
    player.gold = 99;
    assert.equal(respec(player), false);
    assert.equal(player.stats.end, 8);
    assert.equal(player.gold, 99);
  });

  it("clamps HP down to the lower max after removing Endurance", () => {
    const player = newPlayer();
    grantXp(player, 50);
    allocatePoints(player, { end: 3 });
    player.hp = 80;
    player.gold = 100;
    respec(player);
    assert.equal(player.hp, 50);
  });
});

describe("drops", () => {
  it("rolls gold (2–4 × level) and arrows within the zombie table ranges", () => {
    const random = mulberry32(5);
    let goldDrops = 0;
    let arrowDrops = 0;
    const runs = 5000;
    for (let i = 0; i < runs; i++) {
      const { gold, arrows } = rollDrops(enemyAtLevel("zombie", 1), random);
      if (gold) {
        goldDrops++;
        assert.ok(gold >= 2 && gold <= 4);
      }
      if (arrows) {
        arrowDrops++;
        assert.ok(arrows >= 2 && arrows <= 5);
      }
    }
    assert.ok(Math.abs(goldDrops / runs - 0.6) < 0.03);
    assert.ok(Math.abs(arrowDrops / runs - 0.02) < 0.02);
  });

  it("caps arrows at the quiver size", () => {
    const player = newPlayer();
    player.arrows = 998;
    collectDrops(player, { gold: 2, arrows: 5 });
    assert.equal(player.arrows, 999);
    assert.equal(player.gold, 27);
  });
});

describe("Game integration", () => {
  it("awards XP and drops when a zombie dies", () => {
    const game = new Game(42, { random: mulberry32(9) });
    const zombie = new Enemy(enemyAtLevel("zombie", 1), { id: "z", tx: 10, ty: 10 });
    game.enemies.push(zombie);
    const goldBefore = game.player.gold;
    game.damageEnemy(zombie, 10);
    assert.equal(game.player.xp, 10);
    assert.ok(game.player.gold >= goldBefore);
    assert.ok(game.effects.texts.some((t) => t.text.startsWith("+10 XP")));
  });

  it("gives less XP for an enemy below your level", () => {
    const game = new Game(42);
    game.player.level = 3;
    game.damageEnemy(new Enemy(enemyAtLevel("zombie", 1), { id: "z", tx: 10, ty: 10 }), 10);
    assert.equal(game.player.xp, 5, "two levels above: 50% of 10");
  });

  it("toasts on level-up", () => {
    const game = new Game(42);
    game.player.xp = 45;
    const zombie = new Enemy(enemyAtLevel("zombie", 1), { id: "z", tx: 10, ty: 10 });
    game.damageEnemy(zombie, 10);
    assert.equal(game.player.level, 2);
    assert.ok(game.events.some((e) => e.text.startsWith("Level up!")));
  });

  it("finds the Respec Trainer only within interact range", () => {
    const game = new Game(42);
    const trainer = VILLAGE_NPCS.find((n) => n.id === "trainer");
    const cx = (trainer.tx + 0.5) * T;
    const cy = (trainer.ty + 0.5) * T;
    game.player.teleport(cx + INTERACT_RANGE * T - 2, cy);
    assert.equal(game.nearbyNpc(), trainer);
    game.player.teleport(cx + INTERACT_RANGE * T + 2, cy);
    assert.equal(game.nearbyNpc(), null);
  });

  it("toasts the shortfall when a respec is unaffordable", () => {
    const game = new Game(42);
    game.player.level = 2;
    game.player.gold = 30;
    assert.equal(game.buyRespec(), false);
    assert.deepEqual(game.events, [{ type: "toast", text: "A respec costs 100 g. You have 30 g." }]);
  });
});

describe("village NPCs", () => {
  it("stand on walkable village floor", () => {
    const game = new Game(42);
    for (const npc of VILLAGE_NPCS) {
      assert.ok(game.world.isSafeZone(npc.tx, npc.ty));
      assert.equal(game.world.isSolidAt(npc.tx, npc.ty), false);
    }
  });
});
