import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BOSS_GOLD_PER_LEVEL, CHUNK_SIZE, DUNGEON_LEVEL_DISTANCE, ENEMY_RESPAWN_TIME, TILE_SIZE, WALL_HP_STEPS } from "../js/config.js";
import { BOSSES, ENEMIES, NORMAL_ENEMIES } from "../js/data/enemies.js";
import { Enemy, EnemyState } from "../js/entities/enemy.js";
import { mulberry32 } from "../js/rng.js";
import { rollDrops } from "../js/systems/loot.js";
import { enemyAtLevel, levelAt, rollRuneCount, runesPerBoss, typesAtLevel, xpScale } from "../js/systems/scaling.js";
import { Spawner } from "../js/systems/spawner.js";
import { Tile } from "../js/world/tiles.js";
import { VILLAGE_CENTER_TILE, isInVillageBuffer } from "../js/world/village.js";
import { World } from "../js/world/world.js";

const T = TILE_SIZE;
const DT = 1 / 60;
const def = enemyAtLevel("zombie", 1);

function setup(playerTilesAway, overrides = {}, enemyDef = def) {
  const zombie = new Enemy(enemyDef, { id: "z", tx: 50, ty: 50 }, mulberry32(3));
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
    assert.equal(zombie.state, EnemyState.CHASE);
  });

  it("ignores a player beyond range, out of sight, or in the village", () => {
    for (const [distance, overrides] of [[7, {}], [4, { canSee: () => false }], [4, { playerSafe: true }]]) {
      const { zombie, ctx } = setup(distance, overrides);
      run(zombie, ctx, 0.5);
      assert.notEqual(zombie.state, EnemyState.CHASE);
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
    zombie.setState(EnemyState.CHASE);
    zombie.update(DT, ctx);
    assert.equal(zombie.state, EnemyState.WINDUP);
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
    zombie.setState(EnemyState.CHASE);
    zombie.update(DT, ctx);
    player.x += 2 * T;
    run(zombie, ctx, 0.3);
    assert.equal(attacks.length, 0);
  });

  it("is interrupted by a knockback hit", () => {
    const { zombie, ctx, attacks } = setup(0.9);
    zombie.setState(EnemyState.WINDUP);
    zombie.takeHit(5, Math.PI, 0.5);
    assert.equal(zombie.state, EnemyState.CHASE);
    run(zombie, ctx, 0.15);
    assert.equal(attacks.length, 0);
  });
});

describe("zombie de-aggro", () => {
  it("returns home beyond 12 tiles and heals on arrival", () => {
    const { zombie, player, ctx } = setup(5);
    zombie.setState(EnemyState.CHASE);
    zombie.hp = 4;
    player.x = zombie.x + 13 * T;
    zombie.update(DT, ctx);
    assert.equal(zombie.state, EnemyState.RETURN);
    player.x = zombie.x + 100 * T;
    run(zombie, ctx, 3);
    assert.equal(zombie.state, EnemyState.IDLE);
    assert.equal(zombie.hp, def.hp);
  });

  it("gives up the chase when the player enters the village", () => {
    const { zombie, ctx } = setup(3);
    zombie.setState(EnemyState.CHASE);
    zombie.update(DT, { ...ctx, playerSafe: true });
    assert.equal(zombie.state, EnemyState.RETURN);
  });
});

describe("enemy scaling", () => {
  it("grows HP by half and damage by 0.35 of level 1 per level", () => {
    assert.deepEqual([enemyAtLevel("zombie", 1).hp, enemyAtLevel("zombie", 2).hp, enemyAtLevel("zombie", 3).hp], [10, 15, 20]);
    assert.ok(Math.abs(enemyAtLevel("zombie", 2).damage - 2.7) < 1e-9);
    assert.equal(enemyAtLevel("zombie", 5).xp, 50, "XP is level 1 XP × level");
  });

  it("jumps in HP at the wall every 16 levels", () => {
    const before = enemyAtLevel("zombie", 16).hp;
    const after = enemyAtLevel("zombie", 17).hp;
    assert.ok(after / before > WALL_HP_STEPS[0], `${before} → ${after}`);
  });

  it("gives less XP against weaker enemies, never below 10%", () => {
    assert.deepEqual([xpScale(5, 5), xpScale(5, 7), xpScale(6, 5), xpScale(8, 5), xpScale(20, 5)], [1, 1, 0.75, 0.25, 0.1]);
  });

  it("introduces slimes by level: green from 2, red from 3, blue from 4", () => {
    assert.deepEqual(typesAtLevel(1, NORMAL_ENEMIES), ["zombie"]);
    assert.deepEqual(typesAtLevel(3, NORMAL_ENEMIES), ["zombie", "greenSlime", "redSlime"]);
    assert.deepEqual(typesAtLevel(4, NORMAL_ENEMIES), NORMAL_ENEMIES);
  });

  it("raises the level by one every 50 tiles from the village", () => {
    const c = Math.floor(VILLAGE_CENTER_TILE);
    assert.equal(levelAt(c, c), 1);
    assert.equal(levelAt(c + DUNGEON_LEVEL_DISTANCE + 1, c), 2);
    assert.equal(levelAt(c - 16 * DUNGEON_LEVEL_DISTANCE - 1, c), 17, "the endless world keeps going, negative coordinates too");
  });
});

describe("slimes", () => {
  it("hop: they cover ground in bursts, about as fast as walking on average", () => {
    const slime = enemyAtLevel("greenSlime", 2);
    const { zombie: s, ctx } = setup(5, {}, slime);
    s.setState(EnemyState.CHASE);
    const positions = [];
    for (let i = 0; i < 60; i++) {
      s.update(DT, ctx);
      positions.push(s.x);
    }
    const still = positions.filter((x, i) => i > 0 && x === positions[i - 1]).length;
    assert.ok(still > 15, `rests between hops (${still} still frames)`);
    const travelled = (s.x - s.homeX) / T;
    const walker = slime.speed * 5; // tiles in 1 s at full walking speed
    assert.ok(travelled > walker * 0.5 && travelled < walker * 1.6, `travelled ${travelled.toFixed(2)} tiles`);
  });
});

describe("bosses", () => {
  const boss = enemyAtLevel("golem", 5);

  it("can't be knocked back, and power through a hit mid-windup", () => {
    const { zombie: b } = setup(1, {}, boss);
    b.setState(EnemyState.WINDUP);
    b.takeHit(5, Math.PI, 0.5);
    assert.equal(b.knockback, null);
    assert.equal(b.state, EnemyState.WINDUP);
  });

  it("drop gold and runes of their own type: more runes at higher levels", () => {
    const drops = rollDrops(boss, () => 0.99);
    assert.deepEqual(drops.runes, { end: 1 });
    assert.equal(drops.gold, BOSS_GOLD_PER_LEVEL * 5);
    assert.equal(rollRuneCount(10, () => 0.99), 2, "level 10: always 2");
    assert.equal(rollRuneCount(6, () => 0.1), 2, "level 6: 15% chance of a second rune");
    assert.equal(rollRuneCount(6, () => 0.2), 1);
    assert.deepEqual([4, 5, 6, 7, 8, 9, 10, 11].map(runesPerBoss), [0, 1, 1.15, 1.35, 1.6, 1.85, 2, 2.15]);
  });

  it("are one per rune stat", () => {
    assert.deepEqual(BOSSES.map((id) => ENEMIES[id].rune).sort(), ["dex", "end", "int", "str"]);
  });
});

describe("drops", () => {
  it("scale zombie gold with the zombie's level", () => {
    const always = () => 0;
    assert.equal(rollDrops(enemyAtLevel("zombie", 1), always).gold, 2);
    assert.equal(rollDrops(enemyAtLevel("zombie", 5), always).gold, 10);
  });

  it("give slimes' goop to the pouch", () => {
    assert.deepEqual(rollDrops(enemyAtLevel("blueSlime", 4), () => 0).materials, { blueGoop: 1 });
    assert.deepEqual(rollDrops(enemyAtLevel("redSlime", 3), () => 0.99).materials, {});
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
    const spawner = new Spawner(world);
    const enemies = [];
    const view = { x: player.x - 400, y: player.y - 225, width: 800, height: 450 };
    spawner.update(1, 0, player, enemies, view);
    assert.ok(enemies.length > 0);
    for (const z of enemies) {
      const inView = z.x >= view.x - T && z.x <= view.x + view.width + T && z.y >= view.y - T && z.y <= view.y + view.height + T;
      assert.ok(!inView, "spawned on screen");
    }
    const count = enemies.length;
    spawner.update(1, 1, player, enemies, view);
    assert.equal(enemies.length, count, "no duplicates per spawn point");
  });

  it("spawns each point's enemy at the level of where it stands, from the types of that level", () => {
    const spawner = new Spawner(world);
    const enemies = [];
    spawner.update(1, 0, player, enemies, null);
    for (const e of enemies) {
      const level = levelAt(Math.floor(e.homeX / T), Math.floor(e.homeY / T));
      assert.equal(e.level, level);
      assert.ok(typesAtLevel(level, NORMAL_ENEMIES).includes(e.def.id), `${e.def.id} at level ${level}`);
    }
    const again = spawner.enemyFor({ tx: 100, ty: 100 });
    assert.equal(again, spawner.enemyFor({ tx: 100, ty: 100 }), "a spawn point always makes the same enemy");
  });

  it("waits out the respawn timer after a kill", () => {
    const spawner = new Spawner(world);
    const enemies = [];
    spawner.update(1, 0, player, enemies, null);
    const victim = enemies.pop();
    spawner.onEnemyKilled(victim, 0);
    spawner.update(1, ENEMY_RESPAWN_TIME - 1, player, enemies, null);
    assert.ok(!enemies.some((z) => z.spawnId === victim.spawnId));
    spawner.update(1, ENEMY_RESPAWN_TIME + 1, player, enemies, null);
    assert.ok(enemies.some((z) => z.spawnId === victim.spawnId));
  });

  it("despawns calm enemies when the player moves far away", () => {
    const spawner = new Spawner(world);
    const enemies = [];
    spawner.update(1, 0, player, enemies, null);
    assert.ok(enemies.length > 0);
    const farPlayer = { x: player.x + 6 * CHUNK_SIZE * T, y: player.y };
    spawner.update(1, 1, farPlayer, enemies, null);
    assert.ok(enemies.every((z) => Math.abs(z.homeX - farPlayer.x) < 3 * CHUNK_SIZE * T));
  });
});
