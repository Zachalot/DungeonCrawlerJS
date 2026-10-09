import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FOG_REVEAL_RADIUS, TILE_SIZE } from "../js/config.js";
import { Game } from "../js/game.js";
import { MIGRATIONS, migrate, restoreGame, serializeGame, validateSave } from "../js/save.js";
import { dungeonForCell } from "../js/world/dungeons.js";
import { Fog } from "../js/world/fog.js";

const T = TILE_SIZE;
const idle = { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, attack: false, attackPressed: false, weapon: null };

describe("Fog", () => {
  it("reveals a circle and nothing outside it", () => {
    const fog = new Fog();
    fog.reveal(100, 100, 8);
    assert.ok(fog.isExplored(100, 100));
    assert.ok(fog.isExplored(108, 100));
    assert.ok(!fog.isExplored(109, 100));
    assert.ok(!fog.isExplored(106, 106), "corner of the square is outside the circle");
  });

  it("spans chunk boundaries, including negative coordinates", () => {
    const fog = new Fog();
    fog.reveal(0, 0, 2);
    assert.ok(fog.isExplored(-2, 0));
    assert.ok(fog.isExplored(31, 0) === false);
    assert.ok(fog.isExplored(0, -1));
    assert.equal(fog.chunks.size, 4);
  });

  it("only bumps its version when something new is revealed", () => {
    const fog = new Fog();
    fog.reveal(10, 10, 3);
    const version = fog.version;
    assert.equal(fog.reveal(10, 10, 3), false);
    assert.equal(fog.version, version);
  });

  it("round-trips through serialize/deserialize", () => {
    const fog = new Fog();
    fog.reveal(50, 70, 8);
    fog.reveal(300, 20, 5);
    const copy = Fog.deserialize(JSON.parse(JSON.stringify(fog.serialize())));
    for (const [x, y] of [[50, 70], [58, 70], [300, 20], [305, 20]]) assert.ok(copy.isExplored(x, y));
    assert.ok(!copy.isExplored(200, 200));
  });
});

describe("Game fog", () => {
  it("reveals around the spawn and as the player walks", () => {
    const game = new Game(42);
    const { tileX, tileY } = game.player;
    assert.ok(game.fog.isExplored(tileX, tileY));
    assert.ok(!game.fog.isExplored(tileX, tileY + FOG_REVEAL_RADIUS + 5));
    game.player.teleport(game.player.x, game.player.y + 10 * T);
    game.update(1 / 60, idle);
    assert.ok(game.fog.isExplored(tileX, tileY + FOG_REVEAL_RADIUS + 5));
  });

  it("keeps dungeon exploration separate and fresh per visit", () => {
    const game = new Game(42);
    const entrance = dungeonForCell(42, 3, 4);
    game.enterDungeon(entrance);
    const { tileX, tileY } = game.player;
    assert.ok(game.currentFog === game.dungeonFog);
    assert.ok(game.dungeonFog.isExplored(tileX, tileY));
    game.exitDungeon();
    game.enterDungeon(entrance);
    assert.ok(game.dungeonFog.isExplored(tileX, tileY), "re-revealed at the portal");
    assert.equal(game.dungeonFog.chunks.size <= 4, true);
  });

  it("saves and restores overworld exploration", () => {
    const game = new Game(42);
    game.player.teleport(150 * T, 150 * T);
    game.update(1 / 60, idle);
    const restored = restoreGame(JSON.parse(JSON.stringify(serializeGame(game))));
    assert.ok(restored.fog.isExplored(150, 150));
    assert.ok(restored.fog.isExplored(200, 200), "spawn area");
    assert.ok(!restored.fog.isExplored(50, 50));
  });

  it("migrates v2 saves to v3 with an empty map", () => {
    const data = serializeGame(new Game(42));
    delete data.explored;
    const v2 = { ...data, version: 2 };
    const migrated = migrate(v2);
    assert.deepEqual(migrated.explored, {});
    validateSave(migrated);
    assert.deepEqual(MIGRATIONS[2]({ version: 2 }), { version: 3, explored: {} });
  });
});
