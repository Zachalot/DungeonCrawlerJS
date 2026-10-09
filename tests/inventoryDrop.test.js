import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Game } from "../js/game.js";
import { addItem } from "../js/systems/inventory.js";
import { classifyInventoryDrop } from "../js/ui/inventory.js";

function playerWithLegs() {
  const game = new Game(42);
  addItem(game.player.inventory, "leather_legs", 1, game.newUid);
  const legs = game.player.inventory.findIndex((s) => s?.defId === "leather_legs");
  const potion = game.player.inventory.findIndex((s) => s?.defId === "hp_potion_1");
  return { player: game.player, legs, potion };
}

describe("classifyInventoryDrop", () => {
  it("accepts gear only on its own slot, and flags other slots for a friendly message", () => {
    const { player, legs } = playerWithLegs();
    assert.equal(classifyInventoryDrop(`bag:${legs}`, "equip:legs", player), "valid");
    assert.equal(classifyInventoryDrop(`bag:${legs}`, "equip:chest", player), "invalid");
    assert.equal(classifyInventoryDrop(`bag:${legs}`, "equip:sword", player), "invalid");
  });

  it("flags potions on any equipment slot", () => {
    const { player, potion } = playerWithLegs();
    assert.equal(classifyInventoryDrop(`bag:${potion}`, "equip:helmet", player), "invalid");
  });

  it("allows rearranging the bag, but not dropping a cell on itself", () => {
    const { player, legs } = playerWithLegs();
    assert.equal(classifyInventoryDrop(`bag:${legs}`, "bag:20", player), "valid");
    assert.equal(classifyInventoryDrop(`bag:${legs}`, `bag:${legs}`, player), null);
  });

  it("lets equipped gear go back to the bag but not to a different slot", () => {
    const { player } = playerWithLegs();
    assert.equal(classifyInventoryDrop("equip:sword", "bag:5", player), "valid");
    assert.equal(classifyInventoryDrop("equip:sword", "equip:bow", player), "invalid");
    assert.equal(classifyInventoryDrop("equip:sword", "equip:sword", player), null);
  });

  it("ignores drags from an empty bag cell", () => {
    const { player } = playerWithLegs();
    assert.equal(classifyInventoryDrop("bag:23", "equip:legs", player), null);
  });
});
