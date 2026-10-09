import { INVENTORY_SIZE, STASH_SIZE } from "./config.js";
import { MATERIAL_TYPES, RUNE_TYPES } from "./data/enemies.js";
import { EQUIP_SLOTS, ITEMS, STARTER_WEAPONS, potionId } from "./data/items.js";
import { STRUCTURES } from "./data/structures.js";
import { WEAPONS } from "./data/weapons.js";
import { Game } from "./game.js";
import { STAT_KEYS } from "./systems/leveling.js";
import { dungeonForCell } from "./world/dungeons.js";
import { Fog } from "./world/fog.js";

export const SAVE_VERSION = 4;
export const SLOT_COUNT = 3;
const KEY_PREFIX = "dungeonCrawler.slot";
const SIZE_WARNING_BYTES = 1024 * 1024;

/**
 * Upgrades from version N to N + 1, keyed by N. Add one entry whenever the save shape
 * changes, and bump SAVE_VERSION; old saves then upgrade step by step on load.
 */
export const MIGRATIONS = Object.freeze({
  // v2: weapons became items with three equipment slots. Arm v1 characters with starters.
  1: (save) => {
    let nextUid = save.nextUid;
    const equipment = { ...save.player.equipment };
    for (const [slot, defId] of Object.entries(STARTER_WEAPONS)) {
      equipment[slot] = equipment[slot] ?? { uid: `i${nextUid++}`, defId, qty: 1 };
    }
    const grave = save.grave && { ...save.grave, equipment: { sword: null, bow: null, staff: null, ...save.grave.equipment } };
    return { ...save, version: 2, nextUid, player: { ...save.player, equipment }, grave };
  },
  // v3: fog of war. Older saves start with nothing explored; it fills in as you walk.
  2: (save) => ({ ...save, version: 3, explored: {} }),
  // v4: crafting and bosses. Potions got levels (Minor → level 1, Greater → your level), and
  // saves gained the materials pouch, runes, the Gathering skill, village structures, harvested
  // trees and rocks, the dungeon floor you're on, and tutorial flags.
  3: (save) => {
    const level = save.player.level;
    const renamed = { minor_hp_potion: potionId("hp", 1), minor_mana_potion: potionId("mana", 1), greater_hp_potion: potionId("hp", level), greater_mana_potion: potionId("mana", level) };
    const fix = (instance) => (instance && renamed[instance.defId] ? { ...instance, defId: renamed[instance.defId] } : instance);
    const dungeons = Object.fromEntries(
      Object.entries(save.dungeons).map(([id, d]) => [id, { visited: false, ...d, chest: d.chest && { ...d.chest, items: d.chest.items.map(fix) } }]),
    );
    return {
      ...save,
      version: 4,
      player: {
        ...save.player,
        location: { floor: 0, ...save.player.location },
        inventory: save.player.inventory.map(fix),
        materials: Object.fromEntries(MATERIAL_TYPES.map((id) => [id, 0])),
        runes: Object.fromEntries(RUNE_TYPES.map((id) => [id, 0])),
        harvests: 0,
        wheelLevels: {},
      },
      stash: { ...save.stash, items: save.stash.items.map(fix) },
      grave: save.grave && { ...save.grave, items: save.grave.items.map(fix) },
      dungeons,
      structures: [],
      harvested: {},
      flags: { seenBoss: false, seenRune: false },
    };
  },
});

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
      location: game.inDungeon ? { type: "dungeon", id: game.area.id, floor: game.visit.floor } : { type: "overworld" },
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
      materials: { ...player.materials },
      runes: { ...player.runes },
      harvests: player.harvests,
      wheelLevels: { ...player.wheelLevels },
    },
    stash: clone(game.stash),
    grave: clone(game.grave),
    dungeons: Object.fromEntries([...game.dungeonState].map(([id, state]) => [id, clone(state)])),
    explored: game.fog.serialize(),
    structures: clone(game.structures),
    harvested: Object.fromEntries(game.world.harvested),
    flags: { ...game.flags },
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
    materials: { ...p.materials, ...data.player.materials },
    runes: { ...p.runes, ...data.player.runes },
    harvests: data.player.harvests,
    wheelLevels: { ...data.player.wheelLevels },
  });
  game.nextUid = data.nextUid;
  game.playTime = data.playTime;
  game.stash = clone(data.stash);
  game.grave = clone(data.grave);
  game.dungeonState = new Map(Object.entries(clone(data.dungeons)));
  game.fog = Fog.deserialize(data.explored);
  game.structures = clone(data.structures);
  game.syncStructures();
  game.world.harvested = new Map(Object.entries(data.harvested));
  game.flags = { ...game.flags, ...data.flags };

  const { location } = data.player;
  const [cellX, cellY] = location.type === "dungeon" ? location.id.split("_").map(Number) : [];
  const entrance = location.type === "dungeon" ? dungeonForCell(data.seed, cellX, cellY) : null;
  if (entrance) {
    game.player.teleport(data.player.x, data.player.y); // overworld fallback if the dungeon is gone
    game.enterDungeon(entrance, { silent: true, floor: location.floor ?? 0 });
  } else {
    game.player.teleport(data.player.x, data.player.y);
    game.wasSafe = game.isPlayerSafe();
    game.lastRevealKey = null; // the fog was just replaced
    game.revealAroundPlayer();
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
  if (!EQUIP_SLOTS.every((slot) => slot in (p.equipment ?? {}))) fail("player.equipment");
  if (!["overworld", "dungeon"].includes(p.location?.type)) fail("player.location");
  if (!Array.isArray(data.stash?.items) || data.stash.items.length !== STASH_SIZE) fail("stash");
  for (const instance of [...p.inventory, ...Object.values(p.equipment), ...data.stash.items]) {
    if (instance && !ITEMS[instance.defId]) fail(`unknown item ${instance.defId}`);
  }
  for (const slot of EQUIP_SLOTS) {
    const piece = p.equipment[slot];
    if (piece && ITEMS[piece.defId].slot !== slot) fail(`${piece.defId} equipped in the ${slot} slot`);
  }
  if (typeof data.dungeons !== "object" || data.dungeons === null) fail("dungeons");
  if (typeof data.explored !== "object" || data.explored === null) fail("explored");
  if (!MATERIAL_TYPES.every((k) => Number.isFinite(p.materials?.[k]))) fail("player.materials");
  if (!RUNE_TYPES.every((k) => Number.isFinite(p.runes?.[k]))) fail("player.runes");
  if (!Array.isArray(data.structures) || !data.structures.every((st) => STRUCTURES[st.kind] && Number.isInteger(st.level))) fail("structures");
  if (typeof data.harvested !== "object" || data.harvested === null) fail("harvested");
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

/**
 * Three save slots in localStorage (or any Storage-like object, for tests).
 * `owner` is an account id, whose slots are kept apart from other accounts on this browser;
 * null is the guest (no account), which uses the original unprefixed keys.
 */
export class SaveStore {
  constructor(storage = globalThis.localStorage, { owner = null } = {}) {
    this.storage = storage;
    this.owner = owner;
    this.prefix = owner ? `dungeonCrawler.${owner}.slot` : KEY_PREFIX;
  }

  /** [{ slot, summary }] for slots 1..SLOT_COUNT; summary is null (empty) or { level, playTime, savedAt, seed, error? }. */
  list() {
    return Array.from({ length: SLOT_COUNT }, (_, i) => {
      const slot = i + 1;
      return { slot, summary: this.summary(slot) };
    });
  }

  /** One slot's summary (see list), or null if empty. */
  summary(slot) {
    if (!this.raw(slot)) return null;
    try {
      return summarize(this.load(slot));
    } catch (error) {
      return { error: error.message };
    }
  }

  /** The slot's stored JSON string, or null. */
  raw(slot) {
    return this.storage.getItem(this.prefix + slot);
  }

  /** Returns the migrated, validated save in a slot, or null if empty. Throws if corrupt. */
  load(slot) {
    const raw = this.raw(slot);
    if (!raw) return null;
    return validateSave(migrate(JSON.parse(raw)));
  }

  /** Saves a game (or an already-serialized save) to a slot. Returns the stored JSON size in bytes. */
  save(slot, gameOrData) {
    const data = gameOrData instanceof Game ? serializeGame(gameOrData) : gameOrData;
    const json = JSON.stringify(data);
    if (json.length > SIZE_WARNING_BYTES) console.warn(`Save slot ${slot} is ${(json.length / 1024).toFixed(0)} KB`);
    this.storage.setItem(this.prefix + slot, json);
    return json.length;
  }

  delete(slot) {
    this.storage.removeItem(this.prefix + slot);
  }

  /** Cloud sync state for a slot: { revision, dirty, deleted, conflict }. Kept outside the save itself. */
  getMeta(slot) {
    const raw = this.storage.getItem(`${this.prefix}${slot}.meta`);
    return { revision: 0, dirty: false, deleted: false, conflict: false, ...(raw ? JSON.parse(raw) : {}) };
  }

  setMeta(slot, meta) {
    this.storage.setItem(`${this.prefix}${slot}.meta`, JSON.stringify(meta));
  }

  clearMeta(slot) {
    this.storage.removeItem(`${this.prefix}${slot}.meta`);
  }
}

/** Title-screen summary of a save. */
export function summarize(data) {
  return { level: data.player.level, playTime: data.playTime, savedAt: data.savedAt, seed: data.seed };
}

function clone(value) {
  return value === null || value === undefined ? null : structuredClone(value);
}
