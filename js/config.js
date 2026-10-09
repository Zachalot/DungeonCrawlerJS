// Tunable constants. Balance and layout numbers live here, not in logic files.

export const TILE_SIZE = 32; // px
export const CHUNK_SIZE = 32; // tiles per chunk side

// The world is endless; the village sits at the middle of this square, so tiles near it have
// positive coordinates. Beyond it the world keeps generating (negative coordinates too).
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
export const DUNGEON_PACK_SIZE = [6, 8]; // the room just before the chest (or the stairs down)
export const DUNGEON_FLOORS = Object.freeze([
  [1, 1], // [from dungeon level, floors]
  [4, 2],
  [10, 3],
]);
export const DUNGEON_TYPES_PER_FLOOR = 2; // at most this many enemy types on one floor

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

// Leveling. xpToNext(level) = XP_PER_LEVEL × level × XP_CURVE^(level − 1): exponentially slower.
export const XP_PER_LEVEL = 50;
export const XP_CURVE = 1.08;
export const XP_FALLOFF = 0.25; // −25% XP per level you are above the enemy…
export const XP_FLOOR = 0.1; // …down to 10%
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

// Enemy scaling (tuned with tools/balance.js; see designDocs/progression-and-crafting.md).
// A level L enemy has its level-1 stat × (1 + growth × (L − 1)), times a step at every wall:
// levels 17, 33, 49, … (every WALL_LEVELS). The last step repeats for later walls.
export const ENEMY_HP_GROWTH = 0.5;
export const ENEMY_DAMAGE_GROWTH = 0.35;
export const WALL_LEVELS = 16;
export const WALL_HP_STEPS = Object.freeze([3.16, 1.67, 1.05]); // fit with: npm run balance -- --solve
export const WALL_DAMAGE_STEPS = Object.freeze([1.25, 1.25, 1.25]);

// Bosses and runes. One boss type per rune stat; higher-level bosses drop more runes.
export const BOSS_FROM_LEVEL = 5;
export const BOSS_CHANCE = 0.3; // per dungeon visit (the first boss-level dungeon always has one)
export const BOSS_GOLD_PER_LEVEL = 30;
export const RUNE_EXTRA_CHANCES = Object.freeze([0, 0.15, 0.35, 0.6, 0.85]); // chance of one more rune, by (level − 5) % 5
export const RUNE_BONUS = 3; // stat points per applied rune
export const RUNE_CONVERT_RATIO = 4; // 4 runes of one type → 1 of any other
export const ENCHANT_GOLD_PER_LEVEL = 75; // applying a rune costs 75 × player level
export const CONVERT_GOLD_PER_LEVEL = 40; // a conversion costs 40 × player level

// Village tables. Level N costs N × these materials (built new or upgraded in place).
export const ENCHANT_TABLE_COST = Object.freeze({ stone: 40, wood: 30 }); // level N: N runes per gear piece
export const POTION_TABLE_COST = Object.freeze({ wood: 50 }); // level N: potions up to level N

// Gathering: hold F next to a tree (axe) or rock (pickaxe).
export const HARVEST_TIME = 1; // s
export const WOOD_PER_TREE = Object.freeze([3, 5]);
export const STONE_PER_ROCK = Object.freeze([3, 5]);
export const NODE_REGROW_TIME = 300; // s of play before a harvested tree or rock grows back
export const NODES_PER_GATHER_LEVEL = 20; // Gathering skill: a level every 20 harvests…
export const GATHER_BONUS_PER_LEVEL = 0.02; // …each adding 2% chance of a bonus harvest…
export const GATHER_BONUS_CAP = 0.5; // …up to 50%

// Ranged resources: the sword is free; arrows and mana cost gold, so range is used sparingly.
export const ARROW_GOLD_PER_LEVEL = 1.5; // one arrow costs 1.5 × player level

// Potions have levels. Level N: health heals HP_POTION_BASE + HP_POTION_PER_LEVEL × (N − 1),
// mana restores MANA_POTION_PER_LEVEL × N.
export const HP_POTION_BASE = 25;
export const HP_POTION_PER_LEVEL = 10;
export const MANA_POTION_PER_LEVEL = 25;
export const POTION_PRICE_PER_LEVEL = 20; // vendor price of a level N health or mana potion: 20 × N
export const POTION_CRAFT_GOLD_PER_LEVEL = 10; // crafting one costs 10 × N gold (plus goop)
export const TRAVEL_POTION_PRICE_PER_LEVEL = 50;
export const MAX_ITEM_LEVEL = 60; // highest potion level that exists

// Enemy simulation.
export const ENEMY_ACTIVE_CHUNK_RADIUS = 1; // spawn enemies within this many chunks of the player
export const ENEMY_DESPAWN_CHUNK_RADIUS = 2; // despawn idle enemies beyond this
export const ENEMY_RESPAWN_TIME = 120; // s before a dead enemy's spawn point reactivates
export const SPAWN_CHECK_INTERVAL = 0.5; // s

// Feedback timings.
export const HIT_FLASH_TIME = 0.1; // s
export const KNOCKBACK_TIME = 0.1; // s over which knockback distance is applied
export const DAMAGE_NUMBER_TIME = 0.8; // s
export const SWING_EFFECT_TIME = 0.15; // s

export const AUTOSAVE_INTERVAL = 60; // s

// Maps.
export const FOG_REVEAL_RADIUS = 8; // tiles around the player that become explored
export const MINIMAP_SIZE = 160; // px
export const MINIMAP_TILE_PX = 4; // px per tile, so the minimap spans 40 tiles
export const MAP_OPEN_TILE_PX = 5; // full map (M) opens at this zoom, centered on the player
export const MAP_MAX_TILE_PX = 16; // most zoomed-in the full map goes

export const UPDATE_HZ = 60;
export const MAX_FRAME_TIME = 0.25; // s; caps catch-up after a stall
