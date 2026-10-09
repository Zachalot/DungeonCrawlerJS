import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TILE_SIZE } from "../js/config.js";
import { MATERIAL_TYPES, RUNE_TYPES } from "../js/data/enemies.js";
import { Enemy } from "../js/entities/enemy.js";
import { Game } from "../js/game.js";
import { countItem } from "../js/systems/inventory.js";
import { enemyAtLevel, levelAt } from "../js/systems/scaling.js";
import * as dev from "../js/systems/dev.js";
import { devPanelEnabled } from "../js/ui/devPanel.js";
import { dungeonForCell } from "../js/world/dungeons.js";
import { VILLAGE_SPAWN } from "../js/world/village.js";

const T = TILE_SIZE;

describe("dev tools", () => {
  it("adds gold and XP, and levels up exactly once", () => {
    const game = new Game(42);
    dev.addGold(game, 500);
    dev.addXp(game, 20);
    assert.deepEqual([game.player.gold, game.player.xp], [525, 20]);
    dev.levelUp(game);
    assert.deepEqual([game.player.level, game.player.xp, game.player.unspentPoints], [2, 0, 3]);
  });

  it("god mode blocks all damage", () => {
    const game = new Game(42);
    assert.equal(dev.toggleGodMode(game), true);
    assert.equal(game.damagePlayer(999), 0);
    assert.equal(game.player.hp, 50);
    dev.toggleGodMode(game);
    assert.equal(game.damagePlayer(2), 2);
  });

  it("teleports to the nearest dungeon, then the next one when standing on it", () => {
    const game = new Game(42);
    assert.ok(dev.teleportToNearestDungeon(game));
    const first = [game.player.tileX, game.player.tileY - 1];
    assert.deepEqual(first, [174, 213]); // cell 3_4, the closest to the village for seed 42
    game.player.teleport((174 + 0.5) * T, (213 + 0.5) * T);
    dev.teleportToNearestDungeon(game);
    assert.notDeepEqual([game.player.tileX, game.player.tileY - 1], first);
  });

  it("teleports to the village from inside a dungeon", () => {
    const game = new Game(42);
    game.enterDungeon(dungeonForCell(42, 3, 4));
    dev.teleportToVillage(game);
    assert.equal(game.inDungeon, false);
    assert.deepEqual([game.player.x, game.player.y], [VILLAGE_SPAWN.x, VILLAGE_SPAWN.y]);
  });

  it("teleports to the grave only if there is one", () => {
    const game = new Game(42);
    assert.equal(dev.teleportToGrave(game), false);
    game.grave = { x: 100 * T, y: 100 * T, equipment: {}, items: [], arrows: 1 };
    assert.ok(dev.teleportToGrave(game));
    assert.equal(game.player.tileX, 100);
  });

  it("kills enemies within range, with the normal rewards", () => {
    const game = new Game(42);
    game.enemies = [];
    const near = new Enemy(enemyAtLevel("zombie", 1), { id: "a", tx: 201, ty: 205 });
    const far = new Enemy(enemyAtLevel("zombie", 1), { id: "b", tx: 240, ty: 240 });
    game.enemies.push(near, far);
    assert.equal(dev.killNearby(game), 1);
    assert.ok(near.dead && !far.dead);
    assert.equal(game.player.xp, 10);
  });

  it("reveals the dungeon floor, or a big square of the endless overworld around you", () => {
    const game = new Game(42);
    dev.revealMap(game);
    const { tileX, tileY } = game.player;
    assert.ok(game.fog.isExplored(tileX - 100, tileY - 100) && game.fog.isExplored(tileX + 100, tileY + 100));
    assert.ok(!game.fog.isExplored(tileX + 300, tileY));
    game.enterDungeon(dungeonForCell(42, 3, 4));
    dev.revealMap(game);
    assert.ok(game.dungeonFog.isExplored(59, 59));
  });
});

describe("dev tools for crafting and depth", () => {
  it("teleports to a dungeon one level deeper each time", () => {
    const game = new Game(42);
    assert.equal(dev.teleportToDeeperDungeon(game), 2);
    assert.equal(levelAt(game.player.tileX, game.player.tileY - 1), 2);
    assert.equal(dev.teleportToDeeperDungeon(game), 3);
  });

  it("hands out materials, runes, and tools", () => {
    const game = new Game(42);
    dev.addMaterials(game);
    dev.addRunes(game);
    assert.equal(game.player.materials.stone, 100);
    assert.ok(MATERIAL_TYPES.every((id) => game.player.materials[id] >= 20));
    assert.ok(RUNE_TYPES.every((id) => game.player.runes[id] === 5));
    assert.equal(dev.addTools(game), 2);
    assert.equal(dev.addTools(game), 0, "only once");
    assert.equal(countItem(game.player.inventory, "starter_axe"), 1);
  });
});

describe("devPanelEnabled", () => {
  const at = (href) => new URL(href);
  it("is on locally and behind ?dev on the live site", () => {
    assert.equal(devPanelEnabled(at("http://localhost:8080/")), true);
    assert.equal(devPanelEnabled(at("http://127.0.0.1:8091/")), true);
    assert.equal(devPanelEnabled(at("https://zachalot.github.io/DungeonCrawlerJS/")), false);
    assert.equal(devPanelEnabled(at("https://zachalot.github.io/DungeonCrawlerJS/?dev")), true);
  });
});
