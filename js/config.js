// Tunable constants. Balance and layout numbers live here, not in logic files.

export const TILE_SIZE = 32; // px
export const CHUNK_SIZE = 32; // tiles per chunk side

// POC world bound, enforced in world/bounds.js. Remove that check to go endless.
export const WORLD_SIZE = 400; // tiles per side

export const VILLAGE_SIZE = 12; // tiles per side, walls included
export const VILLAGE_BUFFER = 5; // obstacle-free ring around the village
export const VILLAGE_GATE_WIDTH = 2;

export const DUNGEON_CELL_SIZE = 50; // one entrance per cell
export const DUNGEON_CELL_MARGIN = 5; // min distance from cell edge
export const DUNGEON_MIN_VILLAGE_DISTANCE = 15; // Chebyshev tiles from village center
export const DUNGEON_LEVEL_DISTANCE = 50; // tiles per dungeon level step

// Dungeon interiors.
export const DUNGEON_SIZE = 60; // tiles per side
export const DUNGEON_ROOM_COUNT = [5, 8];
export const DUNGEON_ROOM_SIZE = [6, 11]; // tiles per side, inclusive
export const DUNGEON_ROOM_GAP = 2; // min wall tiles between rooms
export const DUNGEON_CORRIDOR_WIDTH = 2;
export const DUNGEON_ZOMBIES_PER_ROOM = [3, 6];
export const DUNGEON_PACK_SIZE = [6, 8]; // the room just before the chest

export const ROCK_DENSITY = 0.03;
export const TREE_DENSITY = 0.05;
export const ZOMBIE_SPAWN_DENSITY = 0.004; // per overworld grass tile

export const PLAYER_SPEED = 5; // tiles per second
export const PLAYER_SIZE = 0.7; // collision box side, in tiles

// Player stats and derived values.
export const STARTING_STATS = Object.freeze({ str: 5, int: 5, dex: 5, end: 5 });
export const HP_PER_END = 10;
export const MANA_PER_INT = 10;
export const STARTING_ARROWS = 30;
export const STARTING_GOLD = 25;
export const MAX_ARROWS = 999;

// Leveling.
export const XP_PER_LEVEL = 50; // xpToNext(level) = XP_PER_LEVEL × level
export const STAT_POINTS_PER_LEVEL = 3;
export const RESPEC_COST_PER_LEVEL = 50; // gold
export const INTERACT_RANGE = 1.5; // tiles
export const PLAYER_IFRAMES = 0.5; // s of invulnerability after taking damage
export const ATTACK_BUFFER_TIME = 0.2; // s a click made during cooldown waits to fire

// Items.
export const INVENTORY_SIZE = 24;
export const STASH_SIZE = 24;
export const POTION_COOLDOWN = 1; // s, shared by all potions
export const RESPAWN_IFRAMES = 2; // s
export const ARMOR_K = 50; // reduction = armor / (armor + ARMOR_K)

// Regen as a fraction of max per second. Mana only refills in the village (or from potions,
// level-ups, and respawning): that's the price of the staff's high damage.
export const OUT_OF_COMBAT_DELAY = 5; // s without dealing or taking damage
export const REGEN = Object.freeze({
  combat: { hp: 0, mana: 0 },
  idle: { hp: 0.01, mana: 0 },
  village: { hp: 0.1, mana: 0.1 },
});

// Enemy simulation.
export const ENEMY_ACTIVE_CHUNK_RADIUS = 1; // spawn zombies within this many chunks of the player
export const ENEMY_DESPAWN_CHUNK_RADIUS = 2; // despawn idle zombies beyond this
export const ENEMY_RESPAWN_TIME = 120; // s before a dead zombie's spawn point reactivates
export const SPAWN_CHECK_INTERVAL = 0.5; // s

// Feedback timings.
export const HIT_FLASH_TIME = 0.1; // s
export const KNOCKBACK_TIME = 0.1; // s over which knockback distance is applied
export const DAMAGE_NUMBER_TIME = 0.8; // s
export const SWING_EFFECT_TIME = 0.15; // s

export const AUTOSAVE_INTERVAL = 60; // s

export const UPDATE_HZ = 60;
export const MAX_FRAME_TIME = 0.25; // s; caps catch-up after a stall
