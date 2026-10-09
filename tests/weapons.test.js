import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TILE_SIZE } from "../js/config.js";
import { EQUIP_SLOTS, STARTER_WEAPONS, WEAPON_SLOTS } from "../js/data/items.js";
import { Game } from "../js/game.js";
import { MIGRATIONS, SAVE_VERSION, migrate, restoreGame, serializeGame, validateSave } from "../js/save.js";
import { addItem, countItem } from "../js/systems/inventory.js";

const T = TILE_SIZE;
const idle = { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, attack: false, attackPressed: false, weapon: null };

describe("weapons as items", () => {
  it("starts a new character with a starter sword, bow, and staff equipped", () => {
    const { player } = new Game(42);
    assert.deepEqual(
      WEAPON_SLOTS.map((slot) => player.equipment[slot]?.defId),
      ["starter_sword", "starter_bow", "starter_staff"],
    );
  });

  it("can't attack with an empty weapon slot, and says how to fix it", () => {
    const game = new Game(42);
    game.unequip("sword");
    assert.equal(countItem(game.player.inventory, "starter_sword"), 1);
    game.attack();
    assert.equal(game.effects.swings.length, 0);
    assert.ok(game.events.some((e) => e.text.startsWith("No sword equipped")));
    assert.ok(game.player.attackCooldown > 0, "throttles the reminder while attack is held");

    game.player.weapon = "staff";
    game.unequip("staff");
    game.player.attackCooldown = 0;
    game.attack();
    assert.equal(game.projectiles.length, 0);
    assert.equal(game.player.mana, 50, "no mana spent without a staff");
  });

  it("re-equips a weapon from the bag into its slot", () => {
    const game = new Game(42);
    game.unequip("bow");
    const index = game.player.inventory.findIndex((s) => s?.defId === "starter_bow");
    assert.ok(game.equip(index));
    assert.equal(game.player.equipment.bow.defId, "starter_bow");
  });
});

describe("equipToSlot", () => {
  it("rejects the wrong slot with a friendly message and moves nothing", () => {
    const game = new Game(42);
    addItem(game.player.inventory, "leather_legs", 1, game.newUid);
    const index = game.player.inventory.findIndex((s) => s?.defId === "leather_legs");
    game.events.length = 0;
    assert.equal(game.equipToSlot(index, "chest"), false);
    assert.equal(game.player.equipment.chest, null);
    assert.equal(game.player.inventory[index].defId, "leather_legs");
    assert.deepEqual(game.events, [{ type: "toast", text: "Leather Leggings goes in the Legs slot, not Chest." }]);

    assert.ok(game.equipToSlot(index, "legs"));
    assert.equal(game.player.equipment.legs.defId, "leather_legs");
  });

  it("rejects potions", () => {
    const game = new Game(42);
    const index = game.player.inventory.findIndex((s) => s?.defId === "hp_potion_1");
    game.events.length = 0;
    assert.equal(game.equipToSlot(index, "helmet"), false);
    assert.match(game.events[0].text, /can't be equipped/);
  });

  it("swaps the previous piece back into the dragged-from bag slot", () => {
    const game = new Game(42);
    addItem(game.player.inventory, "leather_helmet", 1, game.newUid);
    addItem(game.player.inventory, "iron_helmet", 1, game.newUid);
    const leather = game.player.inventory.findIndex((s) => s?.defId === "leather_helmet");
    const iron = game.player.inventory.findIndex((s) => s?.defId === "iron_helmet");
    game.equipToSlot(leather, "helmet");
    game.equipToSlot(iron, "helmet");
    assert.equal(game.player.equipment.helmet.defId, "iron_helmet");
    assert.equal(game.player.inventory[iron].defId, "leather_helmet");
  });
});

describe("bag arrangement", () => {
  it("moves into an empty slot or swaps with an occupied one", () => {
    const game = new Game(42);
    const bag = game.player.inventory;
    const [a, b] = [bag[0].defId, bag[1].defId];
    assert.ok(game.moveInBag(0, 10));
    assert.deepEqual([bag[0], bag[10].defId], [null, a]);
    assert.ok(game.moveInBag(10, 1));
    assert.deepEqual([bag[1].defId, bag[10].defId], [a, b]);
    assert.equal(game.moveInBag(5, 6), false, "nothing to move");
  });

  it("unequips into a chosen empty bag slot, else the first free one", () => {
    const game = new Game(42);
    assert.ok(game.unequip("sword", 7));
    assert.equal(game.player.inventory[7].defId, "starter_sword");
    assert.ok(game.unequip("bow", 0)); // slot 0 holds potions → first free
    assert.equal(game.player.inventory[2].defId, "starter_bow");
  });
});

describe("death with weapons", () => {
  function die(game) {
    game.player.teleport(150 * T, 150 * T);
    game.player.hp = 0;
    game.update(1 / 60, idle);
  }

  it("keeps equipped starter weapons out of the grave", () => {
    const game = new Game(42);
    const swordUid = game.player.equipment.sword.uid;
    game.player.equipment.chest = { uid: "c", defId: "iron_chest", qty: 1 };
    die(game);
    assert.equal(game.player.equipment.sword.uid, swordUid, "same sword, never buried");
    assert.ok(WEAPON_SLOTS.every((slot) => game.grave.equipment[slot] === null));
    assert.equal(game.grave.equipment.chest.defId, "iron_chest");
  });

  it("re-arms an empty weapon slot with a fresh starter on respawn", () => {
    const game = new Game(42);
    game.unequip("staff");
    die(game);
    assert.equal(game.player.equipment.staff.defId, "starter_staff");
    assert.equal(countItem(game.grave.items, "starter_staff"), 1, "the unequipped one went to the grave with the bag");
  });
});

describe("save v1 → v2", () => {
  function v1Save() {
    const data = serializeGame(new Game(42));
    for (const slot of WEAPON_SLOTS) delete data.player.equipment[slot];
    data.grave = { x: 1, y: 2, equipment: { helmet: null, chest: null, legs: null, gloves: null, boots: null }, items: [], arrows: 3 };
    return { ...data, version: 1 };
  }

  it("arms v1 characters with starter weapons and gives the grave weapon slots", () => {
    const old = v1Save();
    const migrated = migrate(old);
    assert.equal(migrated.version, SAVE_VERSION);
    assert.deepEqual(
      WEAPON_SLOTS.map((slot) => migrated.player.equipment[slot].defId),
      WEAPON_SLOTS.map((slot) => STARTER_WEAPONS[slot]),
    );
    assert.equal(migrated.nextUid, old.nextUid + 3);
    assert.ok(EQUIP_SLOTS.every((slot) => slot in migrated.grave.equipment));
    validateSave(migrated);
    assert.equal(restoreGame(migrated).player.equipment.staff.defId, "starter_staff");
  });

  it("keeps a v1 save without a grave grave-less", () => {
    assert.equal(MIGRATIONS[1]({ ...v1Save(), grave: null }).grave, null);
  });

  it("rejects an item equipped in the wrong slot", () => {
    const data = serializeGame(new Game(42));
    data.player.equipment.chest = { uid: "x", defId: "leather_legs", qty: 1 };
    assert.throws(() => validateSave(data), /leather_legs equipped in the chest slot/);
  });
});
