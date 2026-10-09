import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DUNGEON_PACK_SIZE, DUNGEON_SIZE, DUNGEON_TYPES_PER_FLOOR, DUNGEON_ZOMBIES_PER_ROOM, MAX_ARROWS, TILE_SIZE, WORLD_SIZE } from "../js/config.js";
import { BOSSES, ENEMIES, NORMAL_ENEMIES } from "../js/data/enemies.js";
import { potionId } from "../js/data/items.js";
import { Game } from "../js/game.js";
import { mulberry32 } from "../js/rng.js";
import { countItem } from "../js/systems/inventory.js";
import { rollChestLoot } from "../js/systems/loot.js";
import { typesAtLevel } from "../js/systems/scaling.js";
import { floorsFor, generateDungeon } from "../js/world/dungeon.js";
import { dungeonForCell } from "../js/world/dungeons.js";
import { Tile } from "../js/world/tiles.js";

const T = TILE_SIZE;
const SEEDS = [1, 42, 1234567];
const idle = { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, attack: false, attackPressed: false, weapon: null };

function allEntrances(seed) {
  const cells = WORLD_SIZE / 50;
  const list = [];
  for (let cy = 0; cy < cells; cy++) for (let cx = 0; cx < cells; cx++) {
    const e = dungeonForCell(seed, cx, cy);
    if (e) list.push(e);
  }
  return list;
}

function reachable(dungeon, from) {
  const seen = new Set([`${from.tx},${from.ty}`]);
  const queue = [from];
  while (queue.length) {
    const { tx, ty } = queue.pop();
    for (const [nx, ny] of [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]]) {
      const key = `${nx},${ny}`;
      if (seen.has(key) || dungeon.isSolidAt(nx, ny)) continue;
      seen.add(key);
      queue.push({ tx: nx, ty: ny });
    }
  }
  return seen;
}

const key = (p) => `${p.tx},${p.ty}`;

describe("dungeon generation", () => {
  it("is deterministic per entrance and floor", () => {
    const [entrance, other] = allEntrances(42);
    assert.deepEqual(generateDungeon(42, entrance).tiles, generateDungeon(42, entrance).tiles);
    assert.notDeepEqual(generateDungeon(42, entrance).tiles, generateDungeon(42, other).tiles);
    assert.notDeepEqual(generateDungeon(42, entrance, 0).tiles, generateDungeon(42, entrance, 1).tiles);
  });

  it("has one floor below level 4, two from 4, three from 10", () => {
    assert.deepEqual([1, 3, 4, 9, 10, 40].map(floorsFor), [1, 1, 2, 2, 3, 3]);
  });

  for (const seed of SEEDS) {
    it(`builds every floor with connected rooms, stairs or a treasure room, and a mix of enemies (seed ${seed})`, () => {
      for (const entrance of allEntrances(seed)) {
        const floors = floorsFor(entrance.level);
        for (let floor = 0; floor < floors; floor++) {
          const d = generateDungeon(seed, entrance, floor);
          const where = `${d.id} floor ${floor}`;
          assert.ok(d.rooms.length >= 5 && d.rooms.length <= 8, `${where}: ${d.rooms.length} rooms`);
          assert.equal(d.getTile(d.arrival.tx, d.arrival.ty), floor === 0 ? Tile.EXIT_PORTAL : Tile.STAIRS_UP, where);

          const seen = reachable(d, d.arrival);
          if (d.isLastFloor) {
            for (const p of [d.chest, d.rope, d.bossSpawn]) assert.ok(seen.has(key(p)), `${where}: treasure room fixture unreachable`);
            assert.equal(d.stairsDown, null);
          } else {
            assert.equal(d.getTile(d.stairsDown.tx, d.stairsDown.ty), Tile.STAIRS_DOWN);
            assert.ok(seen.has(key(d.stairsDown)), `${where}: stairs down unreachable`);
            assert.equal(d.chest, null);
          }
          for (const s of d.enemySpawns) assert.ok(seen.has(key(s)), `${where}: enemy ${s.id} walled in`);
          const startTile = { tx: Math.floor(d.start.x / T), ty: Math.floor(d.start.y / T) };
          assert.ok(seen.has(key(startTile)), `${where}: arrival tile is solid`);

          // At most two enemy types per floor, all of the dungeon's level.
          const types = new Set(d.enemySpawns.map((s) => s.type));
          assert.ok(types.size <= DUNGEON_TYPES_PER_FLOOR, `${where}: ${[...types]}`);
          for (const t of types) assert.ok(typesAtLevel(entrance.level, NORMAL_ENEMIES).includes(t), `${where}: ${t} too early`);

          // Nobody spawns in the start room; every other room has 3–8 enemies.
          const [startRoom] = d.rooms;
          const inRoom = (r, s) => s.tx >= r.x && s.tx < r.x + r.w && s.ty >= r.y && s.ty < r.y + r.h;
          assert.ok(!d.enemySpawns.some((s) => inRoom(startRoom, s)), `${where}: enemy in start room`);
          for (const room of d.rooms.slice(1)) {
            const n = d.enemySpawns.filter((s) => inRoom(room, s)).length;
            assert.ok(n >= DUNGEON_ZOMBIES_PER_ROOM[0] && n <= DUNGEON_PACK_SIZE[1], `${where}: ${n} enemies in a room`);
          }
        }
      }
    });
  }

  it("keeps the outer ring solid", () => {
    const d = generateDungeon(42, allEntrances(42)[0]);
    for (let i = 0; i < DUNGEON_SIZE; i++) {
      for (const [x, y] of [[i, 0], [0, i], [i, DUNGEON_SIZE - 1], [DUNGEON_SIZE - 1, i]]) assert.ok(d.isSolidAt(x, y));
    }
    assert.ok(d.isSolidAt(-1, 5));
  });
});

describe("chest loot", () => {
  it("has 20–40 gold × the dungeon's level and follows the 60/25/15 weights", () => {
    const random = mulberry32(11);
    const counts = { armor: 0, potions: 0, arrows: 0 };
    const runs = 6000;
    for (let i = 0; i < runs; i++) {
      const { gold, items } = rollChestLoot(3, random);
      assert.ok(gold >= 60 && gold <= 120);
      if (items[0].arrows) counts.arrows++;
      else if (items[0].defId.startsWith("steel_")) counts.armor++;
      else counts.potions++;
    }
    assert.ok(Math.abs(counts.armor / runs - 0.6) < 0.03, JSON.stringify(counts));
    assert.ok(Math.abs(counts.potions / runs - 0.25) < 0.03);
    assert.ok(Math.abs(counts.arrows / runs - 0.15) < 0.03);
  });

  it("holds potions of the dungeon's level, and twice the loot once its boss is dead", () => {
    const potions = rollChestLoot(5, () => 0.7);
    assert.deepEqual(potions.items, [{ defId: potionId("hp", 5), qty: 3 }, { defId: potionId("mana", 5), qty: 3 }]);
    const normal = rollChestLoot(5, () => 0.1);
    const boss = rollChestLoot(5, () => 0.1, { boss: true });
    assert.equal(boss.gold, normal.gold * 2);
    assert.equal(boss.items.length, normal.items.length * 2);
  });
});

describe("Game dungeons", () => {
  function gameAt(entrance) {
    const game = new Game(42, { random: mulberry32(3) });
    game.player.teleport((entrance.tx + 0.5) * T, (entrance.ty + 1.2) * T);
    return game;
  }
  const shallow = allEntrances(42).find((e) => e.level < 4);
  const deep = allEntrances(42).find((e) => e.level >= 5);

  it("enters through the entrance, parks overworld enemies, and exits back beside it", () => {
    const game = gameAt(shallow);
    game.update(1 / 60, idle);
    const overworld = game.enemies;
    assert.equal(game.nearbyInteractable().kind, "entrance");
    assert.equal(game.interact(), null);
    assert.ok(game.inDungeon);
    assert.ok(game.enemies.length >= 15);
    assert.ok(game.enemies.every((e) => e.level === shallow.level));
    assert.ok(game.events.some((e) => e.type === "autosave"));

    const { portal } = game.area;
    game.player.teleport((portal.tx + 0.5) * T, (portal.ty + 1) * T);
    assert.equal(game.nearbyInteractable().kind, "portal");
    game.interact();
    assert.equal(game.inDungeon, false);
    assert.equal(game.enemies, overworld);
    assert.deepEqual([game.player.tileX, game.player.tileY], [shallow.tx, shallow.ty + 1]);
  });

  it("rolls the chest once, marks the dungeon cleared, and restocks enemies but not loot", () => {
    const game = gameAt(shallow);
    game.interact();
    const { chest } = game.area;
    game.player.teleport((chest.tx + 0.5) * T, (chest.ty + 1) * T);
    assert.equal(game.interact(), "chest");
    const first = game.chestContents;
    assert.ok(game.dungeonStatus(shallow.id).cleared);
    assert.equal(game.openChest(), first, "same loot on reopen");

    game.takeAllFromChest();
    assert.equal(game.chestContents.gold, 0);
    game.exitDungeon();
    game.player.teleport((shallow.tx + 0.5) * T, (shallow.ty + 1.2) * T);
    assert.match(game.nearbyInteractable().prompt, /looted/);
    game.interact();
    assert.ok(game.enemies.length >= 15, "enemies restocked");
    assert.equal(game.chestContents, first);
  });

  it("climbs the escape rope in the treasure room straight back out to the entrance", () => {
    const game = gameAt(shallow);
    game.interact();
    const { rope } = game.area;
    game.player.teleport((rope.tx + 0.5) * T, (rope.ty + 1) * T);
    assert.equal(game.nearbyInteractable().kind, "rope");
    game.events.length = 0;
    assert.equal(game.interact(), null);
    assert.equal(game.inDungeon, false);
    assert.deepEqual([game.player.tileX, game.player.tileY], [shallow.tx, shallow.ty + 1]);
    assert.ok(game.events.some((e) => e.type === "autosave"));
  });

  it("goes down and back up the stairs of a deep dungeon, keeping each floor's state for the visit", () => {
    const game = gameAt(deep);
    game.interact();
    assert.equal(game.area.floor, 0);
    assert.equal(game.area.chest, null, "no treasure on the top floor");
    const top = game.area;
    const victim = game.enemies[0];
    game.damageEnemy(victim, 9999);
    game.update(1 / 60, idle);

    const { stairsDown } = game.area;
    game.player.teleport((stairsDown.tx + 0.5) * T, (stairsDown.ty + 1) * T);
    assert.equal(game.nearbyInteractable().kind, "stairsDown");
    game.events.length = 0;
    game.interact();
    assert.equal(game.area.floor, 1);
    assert.ok(game.area.isLastFloor && game.area.chest, "treasure room on the last floor");
    assert.ok(game.events.some((e) => e.type === "autosave"), "saves on the new floor");

    const { stairsUp } = game.area;
    game.player.teleport((stairsUp.tx + 0.5) * T, (stairsUp.ty + 1) * T);
    assert.equal(game.nearbyInteractable().kind, "stairsUp");
    game.interact();
    assert.equal(game.area, top, "same floor as before");
    assert.ok(!game.enemies.includes(victim), "the dead stay dead this visit");
    assert.deepEqual([game.player.tileX, game.player.tileY], [stairsDown.tx, stairsDown.ty + 1], "arrives at the stairs down");
  });

  it("guards the first boss-level dungeon's treasure room with a boss, until one is killed", () => {
    const game = gameAt(deep);
    game.interact();
    game.changeFloor(game.area.floors - 1);
    const boss = game.enemies.find((e) => e.def.boss);
    assert.ok(boss && BOSSES.includes(boss.def.id), "first boss-level dungeon has a boss");
    assert.equal(boss.level, deep.level);
    game.damageEnemy(boss, 99999);
    const rune = ENEMIES[boss.def.id].rune;
    assert.ok(game.player.runes[rune] >= 1, "dropped its rune");
    assert.ok(game.flags.seenBoss && game.flags.seenRune);
    assert.ok(game.events.some((e) => e.type === "toast" && /Enchanting Table/.test(e.text)), "explains what runes are for");
    assert.equal(game.openChest().items.length, 2, "boss chest: two loot rolls");

    // Afterwards it's a 30% chance per visit.
    let bosses = 0;
    for (let i = 0; i < 200; i++) if (game.rollBoss(deep.level)) bosses++;
    assert.ok(bosses > 35 && bosses < 85, `${bosses} / 200`);
    assert.equal(game.rollBoss(4), null, "no bosses below level 5");
  });

  it("leaves items that don't fit in the chest", () => {
    const game = gameAt(shallow);
    game.interact();
    const status = game.dungeonStatus(game.area.id);
    status.chest = { gold: 30, items: [{ defId: potionId("hp", 2), qty: 3 }, { arrows: 100 }] };
    game.player.inventory.fill({ uid: "x", defId: "steel_boots", qty: 1 });
    game.player.arrows = MAX_ARROWS - 40;
    assert.equal(game.takeAllFromChest(), false);
    assert.equal(game.player.arrows, MAX_ARROWS);
    assert.deepEqual(status.chest.items, [{ defId: potionId("hp", 2), qty: 3 }, { arrows: 60 }]);
    assert.equal(game.player.gold, 25 + 30);
    game.player.inventory[0] = null;
    game.takeFromChest(0);
    assert.equal(countItem(game.player.inventory, potionId("hp", 2)), 3);
  });

  it("dungeon enemies stay dead for the visit and don't touch the overworld spawner", () => {
    const game = gameAt(shallow);
    game.interact();
    const enemy = game.enemies[0];
    game.damageEnemy(enemy, 999);
    assert.equal(game.spawner.respawnAt.has(enemy.spawnId), false);
    game.updateEnemies(1 / 60);
    assert.ok(!game.enemies.includes(enemy));
  });
});
