import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_ARROWS } from "../js/config.js";
import { ARMOR_SLOTS, ITEMS } from "../js/data/items.js";
import { BUYBACK_SIZE, VENDORS } from "../js/data/vendors.js";
import { Player } from "../js/entities/player.js";
import { Game } from "../js/game.js";
import { mulberry32 } from "../js/rng.js";
import { drinkPotion } from "../js/systems/consumables.js";
import { buyEntry, repurchase, sellFromSlot } from "../js/systems/economy.js";
import {
  addItem,
  canFit,
  countItem,
  createEquipment,
  createSlots,
  equipFromInventory,
  takeItem,
  totalArmor,
  unequip,
} from "../js/systems/inventory.js";

let uid = 0;
const newUid = () => `t${uid++}`;

function bag(size = 4) {
  return createSlots(size);
}

describe("item data", () => {
  it("prices every item to sell at half (floored), except free starter weapons", () => {
    for (const def of Object.values(ITEMS)) {
      assert.equal(def.sellPrice, def.tier === "starter" ? 0 : Math.floor(def.buyPrice / 2), def.id);
    }
  });

  it("matches the design doc's full-set armor totals", () => {
    for (const [tier, expected] of [["leather", 12], ["iron", 27], ["steel", 44]]) {
      const equipment = Object.fromEntries(ARMOR_SLOTS.map((slot) => [slot, { uid: slot, defId: `${tier}_${slot}`, qty: 1 }]));
      assert.equal(totalArmor(equipment), expected, tier);
    }
  });

  it("never sells chest-only Steel at vendors", () => {
    const stocked = Object.values(VENDORS).flatMap((v) => v.stock.map((e) => e.item)).filter(Boolean);
    assert.ok(stocked.every((id) => ITEMS[id].tier !== "steel"));
  });
});

describe("inventory", () => {
  it("fills stacks before using new slots and caps them at maxStack", () => {
    const slots = bag();
    assert.equal(addItem(slots, "minor_hp_potion", 15, newUid), 0);
    assert.equal(addItem(slots, "minor_hp_potion", 10, newUid), 0);
    assert.deepEqual(slots.map((s) => s?.qty ?? 0), [20, 5, 0, 0]);
  });

  it("returns what didn't fit", () => {
    const slots = bag(2);
    assert.equal(addItem(slots, "iron_helmet", 3, newUid), 1);
    assert.equal(slots.filter(Boolean).length, 2);
  });

  it("probes capacity without changing anything", () => {
    const slots = bag(1);
    addItem(slots, "minor_hp_potion", 19, newUid);
    assert.equal(canFit(slots, "minor_hp_potion", 1), true);
    assert.equal(canFit(slots, "minor_hp_potion", 2), false);
    assert.equal(slots[0].qty, 19);
  });

  it("takes across stacks, all or nothing", () => {
    const slots = bag();
    addItem(slots, "minor_hp_potion", 25, newUid);
    assert.equal(takeItem(slots, "minor_hp_potion", 30), false);
    assert.equal(countItem(slots, "minor_hp_potion"), 25);
    assert.equal(takeItem(slots, "minor_hp_potion", 22), true);
    assert.equal(countItem(slots, "minor_hp_potion"), 3);
  });
});

describe("equipment", () => {
  function playerWith(...defIds) {
    const player = { inventory: bag(), equipment: createEquipment() };
    for (const id of defIds) addItem(player.inventory, id, 1, newUid);
    return player;
  }

  it("equips armor and swaps the old piece back into the same bag slot", () => {
    const player = playerWith("leather_helmet", "iron_helmet");
    assert.ok(equipFromInventory(player, 0));
    assert.equal(player.equipment.helmet.defId, "leather_helmet");
    assert.equal(player.inventory[0], null);
    assert.ok(equipFromInventory(player, 1));
    assert.equal(player.equipment.helmet.defId, "iron_helmet");
    assert.equal(player.inventory[1].defId, "leather_helmet");
  });

  it("refuses to equip potions", () => {
    const player = playerWith("minor_hp_potion");
    assert.equal(equipFromInventory(player, 0), false);
  });

  it("can't unequip into a full bag", () => {
    const player = playerWith("iron_chest");
    equipFromInventory(player, 0);
    for (let i = 0; i < 4; i++) addItem(player.inventory, "iron_boots", 1, newUid);
    assert.equal(unequip(player, "chest"), false);
    assert.equal(player.equipment.chest.defId, "iron_chest");
  });
});

describe("potions", () => {
  function hurtPlayer() {
    const player = new Player(0, 0);
    addItem(player.inventory, "minor_hp_potion", 2, newUid);
    addItem(player.inventory, "greater_hp_potion", 1, newUid);
    player.hp = 10;
    return player;
  }

  it("drinks exactly the chosen type; greater restores 40% of max, floored", () => {
    const player = hurtPlayer();
    player.stats.end = 7; // 70 max HP → 28
    const result = drinkPotion(player, "greater_hp_potion");
    assert.deepEqual([result.restored, player.hp], [28, 38]);
    assert.deepEqual([countItem(player.inventory, "greater_hp_potion"), countItem(player.inventory, "minor_hp_potion")], [0, 2]);
  });

  it("shares a 1 s cooldown, skips at full, and reports when there are none", () => {
    const player = hurtPlayer();
    drinkPotion(player, "minor_hp_potion");
    assert.equal(drinkPotion(player, "greater_hp_potion").reason, "cooldown");
    player.potionCooldown = 0;
    player.hp = 50;
    assert.equal(drinkPotion(player, "minor_hp_potion").reason, "full");
    player.mana = 0;
    assert.equal(drinkPotion(player, "minor_mana_potion").reason, "none");
  });

  it("caps flat potions at max", () => {
    const player = hurtPlayer();
    player.hp = 40;
    assert.equal(drinkPotion(player, "minor_hp_potion").restored, 10);
  });
});

describe("vendors", () => {
  const stock = VENDORS.generalVendor.stock;
  const arrows = stock.find((e) => e.arrows);
  const ironChest = stock.find((e) => e.item === "iron_chest");

  it("buys items into the bag and arrows into the quiver", () => {
    const player = new Player(0, 0);
    player.gold = 100;
    assert.ok(buyEntry(player, ironChest, newUid).ok);
    assert.equal(player.gold, 20);
    assert.equal(countItem(player.inventory, "iron_chest"), 1);
    assert.ok(buyEntry(player, arrows, newUid).ok);
    assert.deepEqual([player.gold, player.arrows], [10, 50]);
  });

  it("refuses without gold, space, or quiver room", () => {
    const player = new Player(0, 0);
    player.gold = 5;
    assert.equal(buyEntry(player, ironChest, newUid).reason, "gold");
    player.gold = 1000;
    player.inventory = bag(0);
    assert.equal(buyEntry(player, ironChest, newUid).reason, "space");
    player.arrows = MAX_ARROWS;
    assert.equal(buyEntry(player, arrows, newUid).reason, "quiver");
  });

  it("sells one at a time for half, and buys back at the sold price", () => {
    const player = new Player(0, 0);
    player.gold = 0;
    addItem(player.inventory, "steel_chest", 1, newUid);
    const buyback = [];
    const index = player.inventory.findIndex((s) => s?.defId === "steel_chest");
    assert.equal(sellFromSlot(player, index, buyback), 150);
    assert.deepEqual(buyback, [{ defId: "steel_chest", price: 150 }]);
    assert.ok(repurchase(player, buyback, 0, newUid).ok);
    assert.deepEqual([player.gold, buyback.length, countItem(player.inventory, "steel_chest")], [0, 0, 1]);
  });

  it("keeps only the 10 most recent sales", () => {
    const player = new Player(0, 0);
    const buyback = [];
    for (let i = 0; i < BUYBACK_SIZE + 3; i++) {
      addItem(player.inventory, "leather_boots", 1, newUid);
      sellFromSlot(player, player.inventory.findIndex((s) => s?.defId === "leather_boots"), buyback);
    }
    assert.equal(buyback.length, BUYBACK_SIZE);
  });
});

describe("Game items", () => {
  it("starts with the design doc kit", () => {
    const { player } = new Game(42);
    assert.equal(countItem(player.inventory, "minor_hp_potion"), 2);
    assert.equal(countItem(player.inventory, "minor_mana_potion"), 2);
    assert.deepEqual([player.gold, player.arrows, player.armor], [25, 30, 0]);
  });

  it("moves stacks and gold between bag and stash", () => {
    const game = new Game(42);
    const index = game.player.inventory.findIndex((s) => s?.defId === "minor_hp_potion");
    assert.ok(game.stashDeposit(index));
    assert.equal(countItem(game.stash.items, "minor_hp_potion"), 2);
    assert.equal(countItem(game.player.inventory, "minor_hp_potion"), 0);
    assert.ok(game.stashWithdraw(game.stash.items.findIndex(Boolean)));
    assert.equal(countItem(game.player.inventory, "minor_hp_potion"), 2);
    assert.equal(game.depositGold(Infinity), 25);
    assert.deepEqual([game.player.gold, game.stash.gold], [0, 25]);
  });

  it("deposits and withdraws all items without touching gold, and vice versa", () => {
    const game = new Game(42);
    addItem(game.player.inventory, "iron_helmet", 1, game.newUid);
    game.player.gold = 90;
    assert.equal(game.stashDepositAll(), 3);
    assert.equal(game.player.inventory.filter(Boolean).length, 0);
    assert.deepEqual([countItem(game.stash.items, "minor_hp_potion"), countItem(game.stash.items, "iron_helmet")], [2, 1]);
    assert.deepEqual([game.player.gold, game.stash.gold], [90, 0], "gold untouched by the items button");

    game.depositGold(Infinity);
    assert.deepEqual([game.player.gold, game.stash.gold], [0, 90]);
    assert.equal(game.stash.items.filter(Boolean).length, 3, "items untouched by the gold button");

    assert.equal(game.stashWithdrawAll(), 3);
    assert.equal(game.stash.items.filter(Boolean).length, 0);
    game.withdrawGold(Infinity);
    assert.deepEqual([game.player.gold, game.stash.gold], [90, 0]);
  });

  it("keeps what doesn't fit when depositing all into a nearly full stash", () => {
    const game = new Game(42);
    game.stash.items.fill({ uid: "s", defId: "steel_boots", qty: 1 });
    game.stash.items[0] = null;
    game.events.length = 0;
    assert.equal(game.stashDepositAll(), 1);
    assert.equal(game.player.inventory.filter(Boolean).length, 1);
    assert.ok(game.events.some((e) => e.text.startsWith("Stash full")));
  });

  it("reduces zombie damage with equipped armor", () => {
    const game = new Game(42, { random: mulberry32(4) });
    for (const slot of ARMOR_SLOTS) game.player.equipment[slot] = { uid: slot, defId: `steel_${slot}`, qty: 1 };
    let taken = 0;
    const hits = 4000;
    for (let i = 0; i < hits; i++) {
      game.player.iframes = 0;
      game.player.hp = 50;
      taken += game.damagePlayer(2);
    }
    // 44 armor → 46.8% reduction → 1.064 expected per hit.
    assert.ok(Math.abs(taken / hits - 2 * (50 / 94)) < 0.04, `avg ${taken / hits}`);
  });
});
