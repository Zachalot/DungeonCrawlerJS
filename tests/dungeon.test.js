import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DUNGEON_PACK_SIZE, DUNGEON_SIZE, DUNGEON_ZOMBIES_PER_ROOM, MAX_ARROWS, TILE_SIZE, WORLD_SIZE } from "../js/config.js";
import { Game } from "../js/game.js";
import { mulberry32 } from "../js/rng.js";
import { countItem } from "../js/systems/inventory.js";
import { rollChestLoot } from "../js/systems/loot.js";
import { generateDungeon } from "../js/world/dungeon.js";
import { dungeonForCell } from "../js/world/dungeons.js";
import { Tile } from "../js/world/tiles.js";

const T = TILE_SIZE;
const SEEDS = [1, 42, 1234567];

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

describe("dungeon generation", () => {
  it("is deterministic per entrance", () => {
    const [entrance] = allEntrances(42);
    assert.deepEqual(generateDungeon(42, entrance).tiles, generateDungeon(42, entrance).tiles);
    const [, other] = allEntrances(42);
    assert.notDeepEqual(generateDungeon(42, entrance).tiles, generateDungeon(42, other).tiles);
  });

  for (const seed of SEEDS) {
    it(`builds 5–8 connected rooms with a reachable chest and zombies (seed ${seed})`, () => {
      for (const entrance of allEntrances(seed)) {
        const d = generateDungeon(seed, entrance);
        assert.ok(d.rooms.length >= 5 && d.rooms.length <= 8, `${d.id}: ${d.rooms.length} rooms`);
        assert.equal(d.getTile(d.portal.tx, d.portal.ty), Tile.EXIT_PORTAL);

        const seen = reachable(d, d.portal);
        assert.ok(seen.has(`${d.chest.tx},${d.chest.ty}`), `${d.id}: chest unreachable`);
        for (const s of d.zombieSpawns) assert.ok(seen.has(`${s.tx},${s.ty}`), `${d.id}: zombie ${s.id} walled in`);
        const startTile = { tx: Math.floor(d.start.x / T), ty: Math.floor(d.start.y / T) };
        assert.ok(seen.has(`${startTile.tx},${startTile.ty}`), `${d.id}: arrival tile is solid`);

        // Nobody spawns in the start room; every other room has 3–8 zombies.
        const [startRoom] = d.rooms;
        const inRoom = (r, s) => s.tx >= r.x && s.tx < r.x + r.w && s.ty >= r.y && s.ty < r.y + r.h;
        assert.ok(!d.zombieSpawns.some((s) => inRoom(startRoom, s)), `${d.id}: zombie in start room`);
        for (const room of d.rooms.slice(1)) {
          const n = d.zombieSpawns.filter((s) => inRoom(room, s)).length;
          assert.ok(n >= DUNGEON_ZOMBIES_PER_ROOM[0] && n <= DUNGEON_PACK_SIZE[1], `${d.id}: ${n} zombies in a room`);
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
  it("always has 20–40 gold and follows the 60/25/15 weights", () => {
    const random = mulberry32(11);
    const counts = { armor: 0, potions: 0, arrows: 0 };
    const runs = 6000;
    for (let i = 0; i < runs; i++) {
      const { gold, items } = rollChestLoot(random);
      assert.ok(gold >= 20 && gold <= 40);
      if (items[0].arrows) counts.arrows++;
      else if (items[0].defId.startsWith("steel_")) counts.armor++;
      else counts.potions++;
    }
    assert.ok(Math.abs(counts.armor / runs - 0.6) < 0.03, JSON.stringify(counts));
    assert.ok(Math.abs(counts.potions / runs - 0.25) < 0.03);
    assert.ok(Math.abs(counts.arrows / runs - 0.15) < 0.03);
  });
});

describe("Game dungeons", () => {
  function gameAtEntrance() {
    const game = new Game(42, { random: mulberry32(3) });
    const entrance = allEntrances(42)[0];
    game.player.teleport((entrance.tx + 0.5) * T, (entrance.ty + 1.2) * T);
    return { game, entrance };
  }

  it("enters through the entrance, parks overworld zombies, and exits back beside it", () => {
    const { game, entrance } = gameAtEntrance();
    game.update(1 / 60, { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, attack: false, attackPressed: false, weapon: null });
    const overworldZombies = game.zombies;
    assert.equal(game.nearbyInteractable().kind, "entrance");
    assert.equal(game.interact(), null);
    assert.ok(game.inDungeon);
    assert.ok(game.zombies.length >= 15);
    assert.ok(game.events.some((e) => e.type === "autosave"));

    const { portal } = game.area;
    game.player.teleport((portal.tx + 0.5) * T, (portal.ty + 1) * T);
    assert.equal(game.nearbyInteractable().kind, "portal");
    game.interact();
    assert.equal(game.inDungeon, false);
    assert.equal(game.zombies, overworldZombies);
    assert.equal(game.player.tileX, entrance.tx);
    assert.equal(game.player.tileY, entrance.ty + 1);
  });

  it("rolls the chest once, marks the dungeon cleared, and restocks zombies but not loot", () => {
    const { game, entrance } = gameAtEntrance();
    game.interact();
    const { chest } = game.area;
    game.player.teleport((chest.tx + 0.5) * T, (chest.ty + 1) * T);
    assert.equal(game.interact(), "chest");
    const first = game.chestContents;
    assert.ok(game.dungeonStatus(entrance.id).cleared);
    assert.equal(game.openChest(), first, "same loot on reopen");

    game.takeAllFromChest();
    assert.equal(game.chestContents.gold, 0);
    game.exitDungeon();
    game.player.teleport((entrance.tx + 0.5) * T, (entrance.ty + 1.2) * T);
    assert.match(game.nearbyInteractable().prompt, /looted/);
    game.interact();
    assert.ok(game.zombies.length >= 15, "zombies restocked");
    assert.equal(game.chestContents, first);
  });

  it("leaves items that don't fit in the chest", () => {
    const { game } = gameAtEntrance();
    game.interact();
    const status = game.dungeonStatus(game.area.id);
    status.chest = { gold: 30, items: [{ defId: "greater_hp_potion", qty: 3 }, { arrows: 100 }] };
    game.player.inventory.fill({ uid: "x", defId: "steel_boots", qty: 1 });
    game.player.arrows = MAX_ARROWS - 40;
    assert.equal(game.takeAllFromChest(), false);
    assert.equal(game.player.arrows, MAX_ARROWS);
    assert.deepEqual(status.chest.items, [{ defId: "greater_hp_potion", qty: 3 }, { arrows: 60 }]);
    assert.equal(game.player.gold, 25 + 30);
    game.player.inventory[0] = null;
    game.takeFromChest(0);
    assert.equal(countItem(game.player.inventory, "greater_hp_potion"), 3);
  });

  it("dungeon zombies stay dead for the visit and don't touch the overworld spawner", () => {
    const { game } = gameAtEntrance();
    game.interact();
    const zombie = game.zombies[0];
    game.damageZombie(zombie, 999);
    assert.equal(game.spawner.respawnAt.has(zombie.spawnId), false);
    game.updateZombies(1 / 60);
    assert.ok(!game.zombies.includes(zombie));
  });
});
