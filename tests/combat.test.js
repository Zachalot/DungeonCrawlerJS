import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PLAYER_IFRAMES, STARTING_STATS, TILE_SIZE } from "../js/config.js";
import { ENEMIES } from "../js/data/enemies.js";
import { WEAPONS } from "../js/data/weapons.js";
import { Game } from "../js/game.js";
import { mulberry32 } from "../js/rng.js";
import { damageReduction, isInArc, mitigate } from "../js/systems/combat.js";
import { applyRegen } from "../js/systems/regen.js";
import { maxHp, maxMana, weaponDamage } from "../js/systems/stats.js";
import { Zombie } from "../js/entities/zombie.js";
import { VILLAGE_SPAWN } from "../js/world/village.js";

const T = TILE_SIZE;

function newGame() {
  return new Game(42, { random: mulberry32(7) });
}

/** A zombie placed `dx, dy` tiles from the player. */
function zombieNear(game, dx, dy) {
  const tx = Math.floor((game.player.x + dx * T) / T);
  const ty = Math.floor((game.player.y + dy * T) / T);
  const zombie = new Zombie(ENEMIES.zombie_l1, { id: `${tx},${ty}`, tx, ty });
  zombie.x = zombie.prevX = game.player.x + dx * T;
  zombie.y = zombie.prevY = game.player.y + dy * T;
  game.zombies.push(zombie);
  return zombie;
}

const idleControls = { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, attack: false, weapon: null };

describe("mitigate", () => {
  it("returns raw damage with no armor", () => {
    for (let raw = 0; raw < 10; raw++) assert.equal(mitigate(raw, 0), raw);
  });

  it("always returns whole numbers bracketing the reduced value", () => {
    const random = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const taken = mitigate(2, 12, random);
      assert.ok(taken === 1 || taken === 2);
    }
  });

  it("averages to raw × (1 − reduction)", () => {
    const random = mulberry32(2);
    const runs = 50000;
    let total = 0;
    for (let i = 0; i < runs; i++) total += mitigate(2, 25, random);
    const expected = 2 * (1 - damageReduction(25));
    assert.ok(Math.abs(total / runs - expected) < 0.02, `avg ${total / runs} vs ${expected}`);
  });

  it("uses the armor / (armor + 50) curve", () => {
    assert.equal(damageReduction(0), 0);
    assert.equal(damageReduction(50), 0.5);
  });
});

describe("isInArc", () => {
  const arc = Math.PI / 2;
  it("hits in front, misses behind and out of range", () => {
    assert.ok(isInArc(0, 0, 0, arc, 40, 30, 5));
    assert.ok(!isInArc(0, 0, 0, arc, 40, -30, 0));
    assert.ok(!isInArc(0, 0, 0, arc, 40, 50, 0));
    assert.ok(!isInArc(0, 0, 0, arc, 40, 10, 30)); // 71° off-axis
  });

  it("handles angle wraparound", () => {
    assert.ok(isInArc(0, 0, Math.PI, arc, 40, -30, -1));
    assert.ok(isInArc(0, 0, -Math.PI, arc, 40, -30, 1));
  });
});

describe("stats", () => {
  it("derives starting values from the design doc formulas", () => {
    assert.equal(maxHp(STARTING_STATS), 50);
    assert.equal(maxMana(STARTING_STATS), 50);
    assert.equal(weaponDamage(WEAPONS.sword, STARTING_STATS), 5);
    assert.equal(weaponDamage(WEAPONS.bow, STARTING_STATS), 7);
    assert.equal(weaponDamage(WEAPONS.staff, STARTING_STATS), 7);
  });

  it("floors fractional damage", () => {
    assert.equal(weaponDamage(WEAPONS.staff, { int: 7 }), 10); // 10.5
  });
});

describe("sword", () => {
  it("cleaves every zombie in the arc, skips those behind, and knocks back", () => {
    const game = newGame();
    game.player.aimAngle = 0;
    const front = zombieNear(game, 1, 0.2);
    const frontOther = zombieNear(game, 0.8, -0.4);
    const behind = zombieNear(game, -1, 0);
    const startX = front.x;

    game.attack();
    assert.equal(front.hp, 5);
    assert.equal(frontOther.hp, 5);
    assert.equal(behind.hp, 10);
    assert.ok(front.knockback, "knockback applied");

    // Knockback lasts KNOCKBACK_TIME (6 steps); afterwards the zombie walks back in.
    for (let i = 0; i < 7; i++) front.update(1 / 60, fakeZombieCtx(game.player));
    assert.ok(front.x > startX + 0.4 * T, "pushed about half a tile away");
  });

  it("kills a Level 1 Zombie in two hits and frees its spawn point", () => {
    const game = newGame();
    const zombie = zombieNear(game, 1, 0);
    game.spawner.alive.set(zombie.spawnId, zombie);
    game.attack();
    game.player.attackCooldown = 0;
    game.attack();
    assert.ok(zombie.dead);
    assert.equal(game.spawner.alive.has(zombie.spawnId), false);
    assert.ok(game.spawner.respawnAt.get(zombie.spawnId) > game.time);
  });

  it("is free and respects its cooldown", () => {
    const game = newGame();
    const controls = { ...idleControls, attack: true, weapon: "sword" };
    game.update(1 / 60, controls);
    assert.ok(game.player.attackCooldown > 0.38);
    assert.equal(game.effects.swings.length, 1);
    game.update(1 / 60, controls);
    assert.equal(game.effects.swings.length, 1, "no second swing during cooldown");
    assert.equal(game.player.arrows, 30);
    assert.equal(game.player.mana, 50);
  });
});

describe("bow", () => {
  it("consumes one arrow per shot", () => {
    const game = newGame();
    game.player.weapon = "bow";
    game.attack();
    assert.equal(game.player.arrows, 29);
    assert.equal(game.projectiles.length, 1);
    assert.equal(game.projectiles[0].damage, 7);
  });

  it("cannot fire without arrows", () => {
    const game = newGame();
    game.player.weapon = "bow";
    game.player.arrows = 0;
    game.attack();
    assert.equal(game.projectiles.length, 0);
    assert.deepEqual(game.events, [{ type: "toast", text: "No arrows!" }]);
  });

  it("hits the first zombie in its path for DEX × 1.5", () => {
    const game = newGame();
    game.player.weapon = "bow";
    game.player.aimAngle = 0;
    const zombie = zombieNear(game, 3, 0);
    game.attack();
    for (let i = 0; i < 30 && game.projectiles.length; i++) game.updateProjectiles(1 / 60);
    assert.equal(zombie.hp, 3);
    assert.equal(game.projectiles.length, 0);
  });

  it("stops at walls", () => {
    const game = newGame();
    game.player.weapon = "bow";
    game.player.aimAngle = -Math.PI / 4; // toward the village's NW corner wall
    game.attack();
    // The corner wall is ~6 tiles away diagonally, closer than the bow's 8-tile range.
    let steps = 0;
    while (game.projectiles.length && steps++ < 200) game.updateProjectiles(1 / 60);
    assert.equal(game.projectiles.length, 0);
    assert.ok(steps < 30, `stopped after ${steps} steps`);
  });
});

describe("staff", () => {
  it("consumes 5 mana per fireball", () => {
    const game = newGame();
    game.player.weapon = "staff";
    game.attack();
    assert.equal(game.player.mana, 45);
    assert.equal(game.projectiles[0].kind, "fireball");
  });

  it("cannot cast without enough mana", () => {
    const game = newGame();
    game.player.weapon = "staff";
    game.player.mana = 4;
    game.attack();
    assert.equal(game.projectiles.length, 0);
    assert.equal(game.player.mana, 4);
    assert.deepEqual(game.events, [{ type: "toast", text: "Not enough mana" }]);
  });
});

describe("player damage", () => {
  it("takes zombie damage and ignores hits during i-frames", () => {
    const game = newGame();
    assert.equal(game.damagePlayer(ENEMIES.zombie_l1.damage), 2);
    assert.equal(game.player.hp, 48);
    assert.equal(game.player.iframes, PLAYER_IFRAMES);
    assert.equal(game.damagePlayer(2), 0);
    assert.equal(game.player.hp, 48);
  });

  it("respawns at the village with full resources on death", () => {
    const game = newGame();
    game.player.teleport(100 * T, 100 * T);
    game.player.hp = 1;
    game.player.mana = 0;
    game.damagePlayer(2);
    game.update(1 / 60, idleControls);
    assert.equal(game.player.hp, 50);
    assert.equal(game.player.mana, 50);
    assert.equal(game.player.x, VILLAGE_SPAWN.x);
    assert.ok(game.events.some((e) => e.text.startsWith("You died")));
  });
});

describe("regen", () => {
  function playerAt(hp, mana) {
    return { stats: { ...STARTING_STATS }, hp, mana, regenRemainder: { hp: 0, mana: 0 } };
  }

  it("uses village, idle, and combat rates", () => {
    const village = playerAt(10, 10);
    applyRegen(village, 1, { inVillage: true, inCombat: false });
    assert.deepEqual([village.hp, village.mana], [15, 15]); // 10%/s of 50

    const idle = playerAt(10, 10);
    applyRegen(idle, 1, { inVillage: false, inCombat: false });
    assert.deepEqual([idle.hp, idle.mana], [10, 11]); // 0.5 HP banked, 1 mana

    const combat = playerAt(10, 10);
    for (let i = 0; i < 60 * 5; i++) applyRegen(combat, 1 / 60, { inVillage: false, inCombat: true });
    assert.deepEqual([combat.hp, combat.mana], [10, 11]); // no HP; 0.25 mana/s → 1.25
  });

  it("never exceeds max", () => {
    const p = playerAt(49, 50);
    applyRegen(p, 10, { inVillage: true, inCombat: false });
    assert.deepEqual([p.hp, p.mana], [50, 50]);
  });
});

function fakeZombieCtx(player, overrides = {}) {
  return {
    player,
    playerSafe: false,
    canSee: () => true,
    solids: { isSolidAt: () => false },
    onAttack: () => {},
    ...overrides,
  };
}
