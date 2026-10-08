// Tunable constants. Balance and layout numbers live here, not in logic files.

export const TILE_SIZE = 32; // px
export const CHUNK_SIZE = 32; // tiles per chunk side

// POC world bound. Delete the bound check in world/chunks.js to go endless.
export const WORLD_SIZE = 400; // tiles per side

export const VILLAGE_SIZE = 12; // tiles per side, walls included
export const VILLAGE_BUFFER = 5; // obstacle-free ring around the village
export const VILLAGE_GATE_WIDTH = 2;

export const DUNGEON_CELL_SIZE = 50; // one entrance per cell
export const DUNGEON_CELL_MARGIN = 5; // min distance from cell edge
export const DUNGEON_MIN_VILLAGE_DISTANCE = 15; // Chebyshev tiles from village center
export const DUNGEON_LEVEL_DISTANCE = 50; // tiles per dungeon level step

export const ROCK_DENSITY = 0.03;
export const TREE_DENSITY = 0.05;

export const PLAYER_SPEED = 5; // tiles per second
export const PLAYER_SIZE = 0.7; // collision box side, in tiles

export const UPDATE_HZ = 60;
export const MAX_FRAME_TIME = 0.25; // s; caps catch-up after a stall
