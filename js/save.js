import { INVENTORY_SIZE, STASH_SIZE } from "./config.js";
import { ARMOR_SLOTS, ITEMS } from "./data/items.js";
import { WEAPONS } from "./data/weapons.js";
import { Game } from "./game.js";
import { STAT_KEYS } from "./systems/leveling.js";
import { dungeonForCell } from "./world/dungeons.js";

export const SAVE_VERSION = 1;
export const SLOT_COUNT = 3;
const KEY_PREFIX = "dungeonCrawler.slot";
const SIZE_WARNING_BYTES = 1024 * 1024;

/**
 * Upgrades from version N to N + 1, keyed by N. Add one entry whenever the save shape
 * changes, and bump SAVE_VERSION; old saves then upgrade step by step on load.
 */
export const MIGRATIONS = Object.freeze({});

// ---- Serialization ----------------------------------------------------------

/** Plain-JSON snapshot of everything that persists. Live enemies and buyback are not saved. */
export function serializeGame(game) {
  const { player } = game;
  return {
    version: SAVE_VERSION,
    seed: game.world.seed,
    savedAt: new Date().toISOString(),
    playTime: Math.floor(game.playTime),
    nextUid: game.nextUid,
    player: {
      x: player.x,
      y: player.y,
      location: game.inDungeon ? { type: "dungeon", id: game.area.id } : { type: "overworld" },
      level: player.level,
      xp: player.xp,
      unspentPoints: player.unspentPoints,
      stats: { ...player.stats },
      hp: player.hp,
      mana: player.mana,
      gold: player.gold,
      arrows: player.arrows,
      weapon: player.weapon,
      equipment: clone(player.equipment),
      inventory: clone(player.inventory),
    },
    stash: clone(game.stash),
    grave: clone(game.grave),
    dungeons: Object.fromEntries([...game.dungeonState].map(([id, state]) => [id, clone(state)])),
  };
}

/** Builds a Game from a (migrated, validated) save. A save made inside a dungeon resumes at its portal. */
export function restoreGame(data, options = {}) {
  const game = new Game(data.seed, options);
  const p = game.player;
  Object.assign(p, {
    level: data.player.level,
    xp: data.player.xp,
    unspentPoints: data.player.unspentPoints,
    stats: { ...data.player.stats },
    hp: data.player.hp,
    mana: data.player.mana,
    gold: data.player.gold,
    arrows: data.player.arrows,
    weapon: WEAPONS[data.player.weapon] ? data.player.weapon : "sword",
    equipment: clone(data.player.equipment),
    inventory: clone(data.player.inventory),
  });
  game.nextUid = data.nextUid;
  game.playTime = data.playTime;
  game.stash = clone(data.stash);
  game.grave = clone(data.grave);
  game.dungeonState = new Map(Object.entries(clone(data.dungeons)));

  const { location } = data.player;
  const [cellX, cellY] = location.type === "dungeon" ? location.id.split("_").map(Number) : [];
  const entrance = location.type === "dungeon" ? dungeonForCell(data.seed, cellX, cellY) : null;
  if (entrance) {
    game.player.teleport(data.player.x, data.player.y); // overworld fallback if the dungeon is gone
    game.enterDungeon(entrance, { silent: true });
  } else {
    game.player.teleport(data.player.x, data.player.y);
    game.wasSafe = game.isPlayerSafe();
  }
  return game;
}

/** Applies migrations until the save reaches `target`. Throws for unknown or future versions. */
export function migrate(data, migrations = MIGRATIONS, target = SAVE_VERSION) {
  let save = data;
  if (!Number.isInteger(save?.version)) throw new Error("Not a save file (no version)");
  if (save.version > target) throw new Error(`Save is from a newer version (v${save.version}) of the game`);
  while (save.version < target) {
    const step = migrations[save.version];
    if (!step) throw new Error(`No migration from save v${save.version}`);
    save = step(save);
  }
  return save;
}

/** Throws a descriptive error if a migrated save is malformed. */
export function validateSave(data) {
  const fail = (what) => {
    throw new Error(`Corrupt save: ${what}`);
  };
  if (!Number.isInteger(data.seed)) fail("seed");
  const p = data.player;
  if (!p || typeof p !== "object") fail("player");
  for (const key of ["x", "y", "level", "xp", "unspentPoints", "hp", "mana", "gold", "arrows"]) {
    if (!Number.isFinite(p[key])) fail(`player.${key}`);
  }
  if (!STAT_KEYS.every((k) => Number.isInteger(p.stats?.[k]))) fail("player.stats");
  if (!Array.isArray(p.inventory) || p.inventory.length !== INVENTORY_SIZE) fail("player.inventory");
  if (!ARMOR_SLOTS.every((slot) => slot in (p.equipment ?? {}))) fail("player.equipment");
  if (!["overworld", "dungeon"].includes(p.location?.type)) fail("player.location");
  if (!Array.isArray(data.stash?.items) || data.stash.items.length !== STASH_SIZE) fail("stash");
  for (const instance of [...p.inventory, ...Object.values(p.equipment), ...data.stash.items]) {
    if (instance && !ITEMS[instance.defId]) fail(`unknown item ${instance.defId}`);
  }
  if (typeof data.dungeons !== "object" || data.dungeons === null) fail("dungeons");
  return data;
}

// ---- Export / import --------------------------------------------------------

/** Base64 save code for copying between browsers. */
export function exportSave(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Decodes, migrates, and validates a save code. Throws with a readable message on bad input. */
export function importSave(code) {
  let data;
  try {
    const binary = atob(code.trim());
    data = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
  } catch {
    throw new Error("That doesn't look like a save code");
  }
  return validateSave(migrate(data));
}

// ---- Slots ------------------------------------------------------------------

/** Three save slots in localStorage (or any Storage-like object, for tests). */
export class SaveStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  /** [{ slot, summary }] for slots 1..SLOT_COUNT; summary is null (empty) or { level, playTime, savedAt, seed, error? }. */
  list() {
    return Array.from({ length: SLOT_COUNT }, (_, i) => {
      const slot = i + 1;
      const raw = this.storage.getItem(KEY_PREFIX + slot);
      if (!raw) return { slot, summary: null };
      try {
        const data = this.load(slot);
        return { slot, summary: { level: data.player.level, playTime: data.playTime, savedAt: data.savedAt, seed: data.seed } };
      } catch (error) {
        return { slot, summary: { error: error.message } };
      }
    });
  }

  /** Returns the migrated, validated save in a slot, or null if empty. Throws if corrupt. */
  load(slot) {
    const raw = this.storage.getItem(KEY_PREFIX + slot);
    if (!raw) return null;
    return validateSave(migrate(JSON.parse(raw)));
  }

  /** Saves a game (or an already-serialized save) to a slot. Returns the stored JSON size in bytes. */
  save(slot, gameOrData) {
    const data = gameOrData instanceof Game ? serializeGame(gameOrData) : gameOrData;
    const json = JSON.stringify(data);
    if (json.length > SIZE_WARNING_BYTES) console.warn(`Save slot ${slot} is ${(json.length / 1024).toFixed(0)} KB`);
    this.storage.setItem(KEY_PREFIX + slot, json);
    return json.length;
  }

  delete(slot) {
    this.storage.removeItem(KEY_PREFIX + slot);
  }
}

function clone(value) {
  return value === null || value === undefined ? null : structuredClone(value);
}
