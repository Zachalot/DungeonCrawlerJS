import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ENCHANT_GOLD_PER_LEVEL, HARVEST_TIME, NODE_REGROW_TIME, RUNE_BONUS, TILE_SIZE, VILLAGE_SIZE } from "../js/config.js";
import { potionId } from "../js/data/items.js";
import { structureCost } from "../js/data/structures.js";
import { Game } from "../js/game.js";
import { mulberry32 } from "../js/rng.js";
import { recipe } from "../js/systems/crafting.js";
import { bonusChance, gatheringLevel } from "../js/systems/gathering.js";
import { addItem, countItem } from "../js/systems/inventory.js";
import { maxHp, totalStats } from "../js/systems/stats.js";
import { dungeonsInRect } from "../js/world/dungeons.js";
import { Tile } from "../js/world/tiles.js";
import { VILLAGE_NPCS, VILLAGE_ORIGIN, VILLAGE_SPAWN } from "../js/world/village.js";

const T = TILE_SIZE;
const step = (held) => ({ move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, attack: false, attackPressed: false, weapon: null, interactHeld: held });

function newGame() {
  return new Game(42, { random: mulberry32(5) });
}

/** A game with the player standing beside the first tree east of (150, 150). */
function besideTree() {
  const game = newGame();
  let tx = 150;
  while (game.world.getTile(tx, 150) !== Tile.TREE || game.world.isSolidAt(tx - 1, 150)) tx++;
  game.player.teleport((tx - 1 + 0.5) * T, 150.5 * T);
  return { game, tx, ty: 150 };
}

function hold(game, seconds) {
  for (let i = 0; i < Math.round(seconds * 60); i++) game.update(1 / 60, step(true));
}

describe("gathering", () => {
  it("needs the right tool", () => {
    const { game } = besideTree();
    game.events.length = 0;
    assert.equal(game.startHarvest(), false);
    assert.ok(game.events.some((e) => /need an axe/.test(e.text)));
  });

  it("takes a held second, yields 3–5 wood, and leaves grass until it regrows", () => {
    const { game, tx, ty } = besideTree();
    addItem(game.player.inventory, "starter_axe", 1, game.newUid);
    assert.equal(game.interact(), null, "F with nothing else nearby starts harvesting");
    hold(game, HARVEST_TIME * 0.5);
    assert.equal(game.player.materials.wood, 0, "not yet");
    hold(game, HARVEST_TIME * 0.6);
    assert.ok(game.player.materials.wood >= 3 && game.player.materials.wood <= 10, `${game.player.materials.wood} wood`);
    assert.equal(game.world.getTile(tx, ty), Tile.GRASS);
    assert.equal(game.player.harvests, 1);

    game.player.teleport(VILLAGE_SPAWN.x, VILLAGE_SPAWN.y);
    game.playTime += NODE_REGROW_TIME;
    game.update(1, step(false));
    assert.equal(game.world.getTile(tx, ty), Tile.TREE, "grew back");
  });

  it("stops if F is let go", () => {
    const { game } = besideTree();
    addItem(game.player.inventory, "starter_axe", 1, game.newUid);
    game.interact();
    hold(game, HARVEST_TIME * 0.5);
    game.update(1 / 60, step(false));
    assert.equal(game.harvesting, null);
    assert.equal(game.player.materials.wood, 0);
  });

  it("levels the Gathering skill every 20 harvests: +2% bonus-harvest chance per level, up to 50%", () => {
    assert.deepEqual([0, 19, 20, 100].map(gatheringLevel), [1, 1, 2, 6]);
    assert.deepEqual([0, 20, 100, 10_000].map(bonusChance), [0, 0.02, 0.1, 0.5]);
  });
});

describe("village structures", () => {
  const inside = VILLAGE_ORIGIN + 4;

  it("places only on open village floor, clear of the walls, NPCs, other structures, and the player", () => {
    const game = newGame();
    game.player.teleport(VILLAGE_SPAWN.x, VILLAGE_SPAWN.y);
    assert.ok(game.canPlace("enchantingTable", inside, inside));
    assert.equal(game.canPlace("enchantingTable", VILLAGE_ORIGIN, inside), false, "wall ring");
    assert.equal(game.canPlace("potionTable", VILLAGE_ORIGIN + VILLAGE_SIZE + 2, inside), false, "outside the village");
    const npc = VILLAGE_NPCS[0];
    assert.equal(game.canPlace("potionTable", npc.tx, npc.ty), false, "on an NPC");
    assert.equal(game.canPlace("potionTable", game.player.tileX, game.player.tileY), false, "on the player");
  });

  it("builds for materials, is solid, moves for free, and upgrades for the next level's cost", () => {
    const game = newGame();
    game.player.teleport(VILLAGE_SPAWN.x, VILLAGE_SPAWN.y);
    assert.equal(game.placeStructure("enchantingTable", inside, inside), false, "can't afford it");
    Object.assign(game.player.materials, { stone: 200, wood: 200 });
    assert.ok(game.placeStructure("enchantingTable", inside, inside));
    assert.deepEqual([game.player.materials.stone, game.player.materials.wood], [200 - 40, 200 - 30]);
    assert.ok(game.world.isSolidAt(inside + 1, inside), "both tiles solid");
    assert.equal(game.canPlace("potionTable", inside + 1, inside), false, "can't overlap");

    assert.ok(game.placeStructure("enchantingTable", inside, inside + 3));
    assert.equal(game.player.materials.stone, 160, "moving is free");
    assert.ok(!game.world.isSolidAt(inside, inside), "old spot cleared");

    assert.ok(game.upgradeStructure("enchantingTable"));
    assert.deepEqual(structureCost("enchantingTable", 2), { stone: 80, wood: 60 });
    assert.deepEqual([game.structure("enchantingTable").level, game.player.materials.stone], [2, 80]);
  });

  it("opens its panel from F", () => {
    const game = newGame();
    game.structures.push({ kind: "potionTable", tx: inside, ty: inside, level: 1 });
    game.syncStructures();
    game.player.teleport((inside + 0.5) * T, (inside + 1.5) * T);
    assert.equal(game.interact(), "potionTable");
  });
});

describe("enchanting", () => {
  function withTable(level = 1) {
    const game = newGame();
    game.structures.push({ kind: "enchantingTable", tx: VILLAGE_ORIGIN + 4, ty: VILLAGE_ORIGIN + 4, level });
    game.player.gold = 10_000;
    game.player.runes.str = 3;
    return game;
  }

  it("applies a rune for 75 × level gold, adding +3 to the stat while equipped", () => {
    const game = withTable();
    game.player.level = 4;
    assert.ok(game.applyRune({ where: "equip", key: "sword" }, "str"));
    assert.equal(game.player.gold, 10_000 - ENCHANT_GOLD_PER_LEVEL * 4);
    assert.equal(game.player.runes.str, 2);
    assert.equal(game.stats.str, 5 + RUNE_BONUS);
    game.unequip("sword");
    assert.equal(game.stats.str, 5, "only while equipped");
  });

  it("holds as many runes per piece as the table's level", () => {
    const game = withTable(1);
    assert.ok(game.applyRune({ where: "equip", key: "sword" }, "str"));
    assert.equal(game.applyRune({ where: "equip", key: "sword" }, "str"), false);
    game.structure("enchantingTable").level = 2;
    assert.ok(game.applyRune({ where: "equip", key: "sword" }, "str"));
    assert.deepEqual(game.player.equipment.sword.enchants, { str: 2 });
  });

  it("converts 4 runes of one type into 1 of another, for gold", () => {
    const game = withTable();
    game.player.runes.int = 9;
    assert.ok(game.convertRunes("int", "end"));
    assert.deepEqual([game.player.runes.int, game.player.runes.end], [5, 1]);
    game.player.runes.dex = 3;
    assert.equal(game.convertRunes("dex", "str"), false, "needs 4");
  });

  it("does nothing without a table", () => {
    const game = newGame();
    game.player.runes.str = 1;
    game.player.gold = 999;
    assert.equal(game.applyRune({ where: "equip", key: "sword" }, "str"), false);
  });

  it("clamps HP when gear with Endurance runes comes off", () => {
    const game = withTable();
    game.player.runes.end = 1;
    game.applyRune({ where: "equip", key: "sword" }, "end");
    game.player.hp = maxHp(totalStats(game.player));
    assert.equal(game.player.hp, 80);
    game.unequip("sword");
    assert.equal(game.player.hp, 50);
  });
});

describe("death with enchanted gear", () => {
  it("buries an enchanted starter weapon and hands out a fresh plain one", () => {
    const game = newGame();
    game.player.equipment.sword.enchants = { str: 1 };
    const enchanted = game.player.equipment.sword;
    game.player.teleport(150 * T, 150 * T);
    game.player.hp = 0;
    game.update(1 / 60, step(false));
    assert.equal(game.grave.equipment.sword, enchanted);
    assert.equal(game.player.equipment.sword.defId, "starter_sword");
    assert.equal(game.player.equipment.sword.enchants, undefined);
    assert.equal(game.player.equipment.bow.defId, "starter_bow", "plain starters stay on you");
    assert.equal(game.grave.equipment.bow, null);

    game.player.teleport(150 * T, 150 * T + 10);
    game.recoverGrave();
    assert.deepEqual(game.player.equipment.sword.enchants, { str: 1 }, "recovered into its slot");
    assert.equal(countItem(game.player.inventory, "starter_sword"), 1, "the stand-in moves to the bag");
  });
});

describe("brewing", () => {
  function withPotionTable(level) {
    const game = newGame();
    game.structures.push({ kind: "potionTable", tx: VILLAGE_ORIGIN + 4, ty: VILLAGE_ORIGIN + 4, level });
    Object.assign(game.player.materials, { redGoop: 20, greenGoop: 20, blueGoop: 20 });
    game.player.gold = 1000;
    return game;
  }

  it("brews from goop and gold, up to the table's level", () => {
    const game = withPotionTable(2);
    assert.deepEqual(recipe("hp", 2), { gold: 20, materials: { redGoop: 2 } });
    assert.deepEqual(recipe("travel", 2), { gold: 20, materials: { redGoop: 6, greenGoop: 6 } });
    assert.ok(game.craftPotion("mana", 2));
    assert.equal(countItem(game.player.inventory, potionId("mana", 2)), 1);
    assert.deepEqual([game.player.materials.blueGoop, game.player.gold], [18, 980]);
    assert.equal(game.craftPotion("hp", 3), false, "table is only level 2");
  });

  it("refuses without enough goop", () => {
    const game = withPotionTable(5);
    game.player.materials.redGoop = 4;
    assert.equal(game.craftPotion("hp", 5), false);
    assert.equal(game.player.materials.redGoop, 4);
  });
});

describe("travel potions", () => {
  it("lists the village and visited dungeons up to the potion's level, then teleports", () => {
    const game = newGame();
    const [low, high] = [1, 5].map((level) => dungeonsInRect(42, 0, 0, 399, 399).find((d) => d.level === level));
    game.dungeonStatus(low.id).visited = true;
    game.dungeonStatus(high.id).visited = true;
    addItem(game.player.inventory, potionId("travel", 3), 1, game.newUid);

    assert.equal(game.drinkPotion(potionId("travel", 3)), "travel", "opens the travel menu");
    const ids = game.travelDestinations(3).map((d) => d.id);
    assert.deepEqual(ids, ["village", low.id], "the level 5 dungeon is too high for a level 3 potion");

    assert.ok(game.travel(potionId("travel", 3), low.id));
    assert.deepEqual([game.player.tileX, game.player.tileY], [low.tx, low.ty + 1]);
    assert.equal(countItem(game.player.inventory, potionId("travel", 3)), 0, "used up");
  });

  it("takes you home from inside a dungeon", () => {
    const game = newGame();
    const entrance = dungeonsInRect(42, 0, 0, 399, 399).find((d) => d.level === 2);
    game.enterDungeon(entrance);
    addItem(game.player.inventory, potionId("travel", 1), 1, game.newUid);
    assert.ok(game.travel(potionId("travel", 1), "village"));
    assert.equal(game.inDungeon, false);
    assert.deepEqual([game.player.x, game.player.y], [VILLAGE_SPAWN.x, VILLAGE_SPAWN.y]);
  });
});
