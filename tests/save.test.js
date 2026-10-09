import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_ARROWS, TILE_SIZE } from "../js/config.js";
import { Game } from "../js/game.js";
import { mulberry32 } from "../js/rng.js";
import { MIGRATIONS, SAVE_VERSION, SaveStore, exportSave, importSave, migrate, restoreGame, serializeGame, validateSave } from "../js/save.js";
import { buryGear, recoverGrave } from "../js/systems/death.js";
import { addItem, countItem } from "../js/systems/inventory.js";
import { dungeonForCell } from "../js/world/dungeons.js";
import { VILLAGE_SPAWN } from "../js/world/village.js";

const T = TILE_SIZE;
const idle = { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, attack: false, attackPressed: false, weapon: null };

/** In-memory stand-in for localStorage. */
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map,
  };
}

function geared(game) {
  const { player } = game;
  player.equipment.chest = { uid: "c1", defId: "iron_chest", qty: 1 };
  player.equipment.boots = { uid: "b1", defId: "leather_boots", qty: 1 };
  addItem(player.inventory, "steel_helmet", 1, game.newUid);
  player.arrows = 77;
  player.gold = 140;
  return game;
}

function killPlayer(game) {
  game.player.hp = 0;
  game.update(1 / 60, idle);
}

describe("death and graves", () => {
  it("buries armor, bag and arrows where you fell; keeps gold; respawns you full at the village", () => {
    const game = geared(new Game(42));
    game.player.teleport(150 * T, 150 * T);
    killPlayer(game);
    const { player, grave } = game;
    assert.deepEqual([grave.x, grave.y], [150 * T, 150 * T]);
    assert.equal(grave.equipment.chest.defId, "iron_chest");
    assert.equal(grave.arrows, 77);
    assert.equal(player.armor, 0);
    assert.equal(player.inventory.filter(Boolean).length, 0);
    assert.deepEqual([player.arrows, player.gold], [0, 140]);
    assert.deepEqual([player.x, player.y, player.hp, player.mana], [VILLAGE_SPAWN.x, VILLAGE_SPAWN.y, 50, 50]);
    assert.ok(game.events.some((e) => e.type === "autosave" && e.reason === "death"));
  });

  it("puts the grave outside the entrance when you die in a dungeon", () => {
    const game = geared(new Game(42));
    const entrance = dungeonForCell(42, 3, 4);
    game.enterDungeon(entrance);
    killPlayer(game);
    assert.equal(game.inDungeon, false);
    assert.deepEqual([Math.floor(game.grave.x / T), Math.floor(game.grave.y / T)], [entrance.tx, entrance.ty + 1]);
  });

  it("keeps only one grave: dying again destroys the first", () => {
    const game = geared(new Game(42));
    game.player.teleport(150 * T, 150 * T);
    killPlayer(game);
    addItem(game.player.inventory, "minor_hp_potion", 1, game.newUid);
    game.player.teleport(160 * T, 160 * T);
    killPlayer(game);
    assert.deepEqual([game.grave.x, game.grave.y], [160 * T, 160 * T]);
    assert.equal(game.grave.equipment.chest, null, "first grave's armor is gone");
    assert.ok(game.events.some((e) => e.type === "toast" && e.text.startsWith("Your previous grave was lost")));
  });

  it("recovers everything, re-equipping armor into its original slots", () => {
    const game = geared(new Game(42));
    game.player.teleport(150 * T, 150 * T);
    killPlayer(game);
    game.player.teleport(150 * T, 150 * T + 10);
    assert.equal(game.nearbyInteractable().kind, "grave");
    game.interact();
    assert.equal(game.grave, null);
    assert.equal(game.player.equipment.chest.defId, "iron_chest");
    assert.equal(countItem(game.player.inventory, "steel_helmet"), 1);
    assert.equal(game.player.arrows, 77);
  });

  it("leaves what doesn't fit in the grave", () => {
    const player = { equipment: { helmet: null, chest: null, legs: null, gloves: null, boots: null }, inventory: [null, null], arrows: 0 };
    player.equipment.chest = { uid: "a", defId: "iron_chest", qty: 1 };
    player.inventory = [{ uid: "b", defId: "steel_boots", qty: 1 }, { uid: "c", defId: "steel_legs", qty: 1 }];
    player.arrows = 50;
    const grave = buryGear(player);
    player.inventory = [null]; // smaller bag now
    player.arrows = MAX_ARROWS - 10;
    assert.equal(recoverGrave(player, grave, () => "u"), false);
    assert.equal(player.equipment.chest.defId, "iron_chest");
    assert.deepEqual(grave.items.map((i) => i.defId), ["steel_legs"]);
    assert.equal(grave.arrows, 40);
  });
});

describe("serialize / restore", () => {
  it("round-trips the player, stash, grave, dungeons and uid counter", () => {
    const game = geared(new Game(42, { random: mulberry32(1) }));
    game.player.stats.str = 9;
    game.player.level = 4;
    game.player.xp = 33;
    game.stash.gold = 12;
    addItem(game.stash.items, "greater_mana_potion", 2, game.newUid);
    game.dungeonStatus("3_4").cleared = true;
    game.dungeonStatus("3_4").chest = { gold: 0, items: [{ arrows: 100 }] };
    game.grave = { x: 10, y: 20, equipment: { helmet: null, chest: null, legs: null, gloves: null, boots: null }, items: [], arrows: 5 };
    game.playTime = 125.7;
    game.player.teleport(180 * T, 190 * T);

    const data = serializeGame(game);
    const restored = restoreGame(JSON.parse(JSON.stringify(data)));
    assert.deepEqual(serializeGame(restored).player, data.player);
    assert.deepEqual(restored.stash, game.stash);
    assert.deepEqual(restored.grave, game.grave);
    assert.deepEqual(restored.dungeonStatus("3_4"), { cleared: true, chest: { gold: 0, items: [{ arrows: 100 }] } });
    assert.equal(restored.nextUid, game.nextUid);
    assert.equal(restored.playTime, 125);
    assert.equal(restored.player.armor, game.player.armor);
  });

  it("doesn't share state with the source game", () => {
    const game = geared(new Game(42));
    const restored = restoreGame(serializeGame(game));
    restored.player.equipment.chest = null;
    assert.equal(game.player.equipment.chest.defId, "iron_chest");
  });

  it("resumes a save made inside a dungeon at that dungeon's portal", () => {
    const game = new Game(42);
    game.enterDungeon(dungeonForCell(42, 3, 4));
    game.player.teleport(game.player.x + 5 * T, game.player.y);
    const restored = restoreGame(serializeGame(game));
    assert.ok(restored.inDungeon);
    assert.equal(restored.area.id, "3_4");
    assert.deepEqual([restored.player.x, restored.player.y], [restored.area.start.x, restored.area.start.y]);
    assert.ok(restored.zombies.length > 0);
    assert.equal(restored.events.length, 0, "silent: no toast or autosave");
  });
});

describe("migrate / validate", () => {
  it("steps through migrations in order", () => {
    const steps = {
      0: (s) => ({ ...s, version: 1, renamed: s.old }),
      1: (s) => ({ ...s, version: 2, added: true }),
    };
    assert.deepEqual(migrate({ version: 0, old: "x" }, steps, 2), { version: 2, old: "x", renamed: "x", added: true });
  });

  it("rejects missing, future, and unmigratable versions", () => {
    assert.throws(() => migrate({}), /no version/);
    assert.throws(() => migrate({ version: SAVE_VERSION + 1 }), /newer version/);
    assert.throws(() => migrate({ version: 0 }, MIGRATIONS, 1), /No migration from save v0/);
  });

  it("accepts a fresh save and names what's wrong with a corrupt one", () => {
    const data = serializeGame(new Game(42));
    assert.equal(validateSave(data), data);
    assert.throws(() => validateSave({ ...data, seed: "x" }), /seed/);
    assert.throws(() => validateSave({ ...data, player: { ...data.player, stats: { str: 1 } } }), /player.stats/);
    const bad = structuredClone(data);
    bad.player.inventory[0] = { uid: "z", defId: "laser_sword", qty: 1 };
    assert.throws(() => validateSave(bad), /unknown item laser_sword/);
  });
});

describe("export / import", () => {
  it("round-trips through a save code", () => {
    const data = serializeGame(geared(new Game(42)));
    assert.deepEqual(importSave(exportSave(data)), data);
  });

  it("explains bad codes", () => {
    assert.throws(() => importSave("definitely not base64!!"), /doesn't look like a save code/);
    assert.throws(() => importSave(btoa(JSON.stringify({ hello: 1 }))), /no version/);
  });
});

describe("SaveStore", () => {
  it("saves, lists, loads and deletes three slots", () => {
    const store = new SaveStore(memoryStorage());
    assert.deepEqual(store.list().map((s) => s.summary), [null, null, null]);

    const game = new Game(7);
    game.player.level = 3;
    game.playTime = 600;
    store.save(2, game);
    const [one, two] = store.list();
    assert.equal(one.summary, null);
    assert.deepEqual([two.summary.level, two.summary.playTime, two.summary.seed], [3, 600, 7]);
    assert.equal(store.load(2).player.level, 3);

    store.delete(2);
    assert.equal(store.load(2), null);
  });

  it("reports an unreadable slot instead of crashing the title screen", () => {
    const storage = memoryStorage();
    storage.setItem("dungeonCrawler.slot1", "{not json");
    const [first] = new SaveStore(storage).list();
    assert.ok(first.summary.error);
  });
});
