import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CHUNK_SIZE, ENEMY_RESPAWN_TIME, TILE_SIZE } from "../js/config.js";
import { ENEMIES } from "../js/data/enemies.js";
import { Zombie, ZombieState } from "../js/entities/zombie.js";
import { mulberry32 } from "../js/rng.js";
import { Spawner } from "../js/systems/spawner.js";
import { Tile } from "../js/world/tiles.js";
import { isInVillageBuffer } from "../js/world/village.js";
import { World } from "../js/world/world.js";

const T = TILE_SIZE;
const DT = 1 / 60;
const def = ENEMIES.zombie_l1;

function setup(playerTilesAway, overrides = {}) {
  const zombie = new Zombie(def, { id: "z", tx: 50, ty: 50 }, mulberry32(3));
  const player = { x: zombie.x + playerTilesAway * T, y: zombie.y };
  const attacks = [];
  const ctx = {
    player,
    playerSafe: false,
    canSee: () => true,
    solids: { isSolidAt: () => false },
    onAttack: (z) => attacks.push(z),
    ...overrides,
  };
  return { zombie, player, ctx, attacks };
}

function run(zombie, ctx, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i++) zombie.update(DT, ctx);
}

describe("zombie aggro", () => {
  it("chases a visible player within 6 tiles", () => {
    const { zombie, ctx } = setup(5);
    zombie.update(DT, ctx);
    assert.equal(zombie.state, ZombieState.CHASE);
  });

  it("ignores a player beyond range, out of sight, or in the village", () => {
    for (const [distance, overrides] of [[7, {}], [4, { canSee: () => false }], [4, { playerSafe: true }]]) {
      const { zombie, ctx } = setup(distance, overrides);
      run(zombie, ctx, 0.5);
      assert.notEqual(zombie.state, ZombieState.CHASE);
    }
  });

  it("closes in at 60% of player speed and stops short of the player", () => {
    const { zombie, player, ctx } = setup(5);
    run(zombie, ctx, 1);
    const travelled = zombie.x - zombie.homeX;
    assert.ok(Math.abs(travelled - 3 * T) < 2, `travelled ${travelled / T} tiles`);
    run(zombie, ctx, 2);
    assert.ok(player.x - zombie.x >= def.stopDistance * T - 1);
  });
});

describe("zombie attack", () => {
  it("winds up for 0.25 s, hits once, then waits for its cooldown", () => {
    const { zombie, ctx, attacks } = setup(0.9);
    zombie.setState(ZombieState.CHASE);
    zombie.update(DT, ctx);
    assert.equal(zombie.state, ZombieState.WINDUP);
    run(zombie, ctx, 0.2);
    assert.equal(attacks.length, 0, "no hit during windup");
    run(zombie, ctx, 0.1);
    assert.equal(attacks.length, 1);
    run(zombie, ctx, 0.9);
    assert.equal(attacks.length, 1, "cooldown holds");
    run(zombie, ctx, 0.4);
    assert.equal(attacks.length, 2);
  });

  it("misses if the player moved out of range during the windup", () => {
    const { zombie, player, ctx, attacks } = setup(0.9);
    zombie.setState(ZombieState.CHASE);
    zombie.update(DT, ctx);
    player.x += 2 * T;
    run(zombie, ctx, 0.3);
    assert.equal(attacks.length, 0);
  });

  it("is interrupted by a knockback hit", () => {
    const { zombie, ctx, attacks } = setup(0.9);
    zombie.setState(ZombieState.WINDUP);
    zombie.takeHit(5, Math.PI, 0.5);
    assert.equal(zombie.state, ZombieState.CHASE);
    run(zombie, ctx, 0.15);
    assert.equal(attacks.length, 0);
  });
});

describe("zombie de-aggro", () => {
  it("returns home beyond 12 tiles and heals on arrival", () => {
    const { zombie, player, ctx } = setup(5);
    zombie.setState(ZombieState.CHASE);
    zombie.hp = 4;
    player.x = zombie.x + 13 * T;
    zombie.update(DT, ctx);
    assert.equal(zombie.state, ZombieState.RETURN);
    player.x = zombie.x + 100 * T;
    run(zombie, ctx, 3);
    assert.equal(zombie.state, ZombieState.IDLE);
    assert.equal(zombie.hp, def.hp);
  });

  it("gives up the chase when the player enters the village", () => {
    const { zombie, ctx } = setup(3);
    zombie.setState(ZombieState.CHASE);
    zombie.update(DT, { ...ctx, playerSafe: true });
    assert.equal(zombie.state, ZombieState.RETURN);
  });
});

describe("spawn points", () => {
  it("only appear on overworld grass outside the village buffer", () => {
    const world = new World(42);
    let count = 0;
    for (let cy = 0; cy < 13; cy++) {
      for (let cx = 0; cx < 13; cx++) {
        for (const s of world.getChunk(cx, cy).spawns) {
          count++;
          assert.equal(world.getTile(s.tx, s.ty), Tile.GRASS);
          assert.ok(!isInVillageBuffer(s.tx, s.ty));
        }
      }
    }
    assert.ok(count > 300 && count < 900, `${count} spawn points`);
  });
});

describe("Spawner", () => {
  const world = new World(42);
  // A point in the middle of chunk (3, 3), well away from the village.
  const player = { x: (3 * CHUNK_SIZE + 16) * T, y: (3 * CHUNK_SIZE + 16) * T };

  it("fills spawn points in nearby chunks, skipping ones on screen", () => {
    const spawner = new Spawner(world, def);
    const zombies = [];
    const view = { x: player.x - 400, y: player.y - 225, width: 800, height: 450 };
    spawner.update(1, 0, player, zombies, view);
    assert.ok(zombies.length > 0);
    for (const z of zombies) {
      const inView = z.x >= view.x - T && z.x <= view.x + view.width + T && z.y >= view.y - T && z.y <= view.y + view.height + T;
      assert.ok(!inView, "spawned on screen");
    }
    const count = zombies.length;
    spawner.update(1, 1, player, zombies, view);
    assert.equal(zombies.length, count, "no duplicates per spawn point");
  });

  it("waits out the respawn timer after a kill", () => {
    const spawner = new Spawner(world, def);
    const zombies = [];
    spawner.update(1, 0, player, zombies, null);
    const victim = zombies.pop();
    spawner.onZombieKilled(victim, 0);
    spawner.update(1, ENEMY_RESPAWN_TIME - 1, player, zombies, null);
    assert.ok(!zombies.some((z) => z.spawnId === victim.spawnId));
    spawner.update(1, ENEMY_RESPAWN_TIME + 1, player, zombies, null);
    assert.ok(zombies.some((z) => z.spawnId === victim.spawnId));
  });

  it("despawns calm zombies when the player moves far away", () => {
    const spawner = new Spawner(world, def);
    const zombies = [];
    spawner.update(1, 0, player, zombies, null);
    assert.ok(zombies.length > 0);
    const farPlayer = { x: player.x + 6 * CHUNK_SIZE * T, y: player.y };
    spawner.update(1, 1, farPlayer, zombies, null);
    assert.ok(zombies.every((z) => Math.abs(z.homeX - farPlayer.x) < 3 * CHUNK_SIZE * T));
  });
});
