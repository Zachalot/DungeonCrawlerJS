import {
  DUNGEON_CORRIDOR_WIDTH,
  DUNGEON_FLOORS,
  DUNGEON_PACK_SIZE,
  DUNGEON_ROOM_COUNT,
  DUNGEON_ROOM_GAP,
  DUNGEON_ROOM_SIZE,
  DUNGEON_SIZE,
  DUNGEON_TYPES_PER_FLOOR,
  DUNGEON_ZOMBIES_PER_ROOM,
  TILE_SIZE,
} from "../config.js";
import { NORMAL_ENEMIES } from "../data/enemies.js";
import { Purpose, hash, mulberry32, randomInt } from "../rng.js";
import { typesAtLevel } from "../systems/scaling.js";
import { Tile, isSolid } from "./tiles.js";

const ROOM_ATTEMPTS = 300;

/** Floors in a dungeon of `level` (one below level 4). */
export function floorsFor(level) {
  return DUNGEON_FLOORS.filter(([from]) => level >= from).at(-1)[1];
}

/**
 * One floor of a dungeon interior. Same tile-access interface as World, so the game can treat
 * both as an "area". Floor 0 starts at the exit portal; deeper floors start at stairs up. Every
 * floor but the last ends at stairs down; the last ends in the treasure room, with the chest,
 * the boss's spot, and an escape rope straight back to the surface.
 */
export class Dungeon {
  constructor(fields) {
    this.kind = "dungeon";
    this.width = DUNGEON_SIZE;
    this.height = DUNGEON_SIZE;
    this.widthPx = DUNGEON_SIZE * TILE_SIZE;
    this.heightPx = DUNGEON_SIZE * TILE_SIZE;
    Object.assign(this, fields);
    // id, level, floor, floors, entrance ({ tx, ty } on the overworld), tiles, variants, rooms,
    // arrival ({ tx, ty }: the portal or stairs up), stairsDown, chest, rope, bossSpawn
    // ({ tx, ty } or null), enemySpawns ([{ id, tx, ty, type }]).
  }

  get isLastFloor() {
    return this.floor === this.floors - 1;
  }

  /** The exit portal on floor 0, or null. */
  get portal() {
    return this.floor === 0 ? this.arrival : null;
  }

  /** Stairs back up on deeper floors, or null. */
  get stairsUp() {
    return this.floor > 0 ? this.arrival : null;
  }

  /** Player arrival point in px: just below the portal or stairs up. */
  get start() {
    return { x: (this.arrival.tx + 0.5) * TILE_SIZE, y: (this.arrival.ty + 1.5) * TILE_SIZE };
  }

  /** Where you arrive coming back up from the floor below: just below the stairs down. */
  get belowStairsDown() {
    return { x: (this.stairsDown.tx + 0.5) * TILE_SIZE, y: (this.stairsDown.ty + 1.5) * TILE_SIZE };
  }

  getTileInfo(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return { tile: Tile.DUNGEON_WALL, variant: 0 };
    const i = ty * this.width + tx;
    return { tile: this.tiles[i], variant: this.variants[i] };
  }

  getTile(tx, ty) {
    return this.getTileInfo(tx, ty).tile;
  }

  isSolidAt(tx, ty) {
    return isSolid(this.getTile(tx, ty));
  }

  isSafeZone() {
    return false;
  }
}

/**
 * Generates one floor of the interior behind an overworld entrance. Pure: the same
 * (seed, entrance, floor) always yields the same layout, so only cleared/looted state needs saving.
 */
export function generateDungeon(seed, entrance, floor = 0) {
  const [cellX, cellY] = entrance.id.split("_").map(Number);
  const floors = floorsFor(entrance.level);
  const layoutSeed = floor === 0 ? hash(seed, cellX, cellY, Purpose.DUNGEON_LAYOUT) : hash(seed, cellX, cellY, Purpose.DUNGEON_LAYOUT, floor);
  const random = mulberry32(layoutSeed);
  const size = DUNGEON_SIZE;
  const tiles = new Uint8Array(size * size).fill(Tile.DUNGEON_WALL);
  const variants = new Uint8Array(size * size).map((_, i) => hash(seed, cellX, cellY, floor, i) & 0xff);
  const carve = (x, y) => {
    if (x > 0 && y > 0 && x < size - 1 && y < size - 1) tiles[y * size + x] = Tile.DUNGEON_FLOOR;
  };

  const rooms = placeRooms(random);
  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) carve(x, y);
  }
  // Connect each room to the nearest earlier one, forming a spanning tree.
  for (let i = 1; i < rooms.length; i++) {
    const nearest = rooms.slice(0, i).reduce((best, r) => (distance(r, rooms[i]) < distance(best, rooms[i]) ? r : best));
    carveCorridor(rooms[i], nearest, random() < 0.5, carve);
  }

  const startRoom = rooms[0];
  const arrival = center(startRoom);
  tiles[arrival.ty * size + arrival.tx] = floor === 0 ? Tile.EXIT_PORTAL : Tile.STAIRS_UP;

  const { distances, parents } = floodFrom(tiles, arrival);
  const roomDistance = (r) => distances[center(r).ty * size + center(r).tx];
  const endRoom = rooms.slice(1).reduce((best, r) => (roomDistance(r) > roomDistance(best) ? r : best));
  const end = center(endRoom);
  const isLast = floor === floors - 1;
  // The chest sits at x + floor(w/2) in a room at least 6 wide, so ±2 tiles stays inside.
  const chest = isLast ? end : null;
  const rope = isLast ? { tx: end.tx + 2, ty: end.ty } : null;
  const bossSpawn = isLast ? { tx: end.tx - 2, ty: end.ty } : null;
  const stairsDown = isLast ? null : end;
  if (stairsDown) tiles[stairsDown.ty * size + stairsDown.tx] = Tile.STAIRS_DOWN;
  const packRoom = roomBeforeEnd(rooms, endRoom, startRoom, end, parents);

  const types = floorTypes(seed, cellX, cellY, floor, entrance.level);
  const enemySpawns = [];
  for (const room of rooms) {
    if (room === startRoom) continue;
    const [min, max] = room === packRoom ? DUNGEON_PACK_SIZE : DUNGEON_ZOMBIES_PER_ROOM;
    const used = new Set([end, rope, bossSpawn].filter(Boolean).map((p) => `${p.tx},${p.ty}`));
    const count = randomInt(random, min, max);
    for (let n = 0; n < count; n++) {
      let tx, ty;
      do {
        tx = randomInt(random, room.x + 1, room.x + room.w - 2);
        ty = randomInt(random, room.y + 1, room.y + room.h - 2);
      } while (used.has(`${tx},${ty}`));
      used.add(`${tx},${ty}`);
      const type = types[Math.floor(random() * types.length)];
      enemySpawns.push({ id: `${entrance.id}:${floor}:${enemySpawns.length}`, tx, ty, type });
    }
  }

  return new Dungeon({
    id: entrance.id,
    level: entrance.level,
    floor,
    floors,
    entrance,
    tiles,
    variants,
    rooms,
    arrival,
    stairsDown,
    chest,
    rope,
    bossSpawn,
    enemySpawns,
  });
}

/** Up to DUNGEON_TYPES_PER_FLOOR enemy types for a floor, picked from those of the dungeon's level. */
export function floorTypes(seed, cellX, cellY, floor, level) {
  const random = mulberry32(hash(seed, cellX, cellY, floor, Purpose.FLOOR_TYPES));
  const pool = typesAtLevel(level, NORMAL_ENEMIES);
  // Fisher–Yates with the floor's own seed, then keep the first few.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, DUNGEON_TYPES_PER_FLOOR);
}

function placeRooms(random) {
  const target = randomInt(random, DUNGEON_ROOM_COUNT[0], DUNGEON_ROOM_COUNT[1]);
  const rooms = [];
  for (let attempt = 0; attempt < ROOM_ATTEMPTS && rooms.length < target; attempt++) {
    const w = randomInt(random, DUNGEON_ROOM_SIZE[0], DUNGEON_ROOM_SIZE[1]);
    const h = randomInt(random, DUNGEON_ROOM_SIZE[0], DUNGEON_ROOM_SIZE[1]);
    const room = { x: randomInt(random, 2, DUNGEON_SIZE - w - 2), y: randomInt(random, 2, DUNGEON_SIZE - h - 2), w, h };
    if (rooms.every((r) => !overlaps(r, room, DUNGEON_ROOM_GAP))) rooms.push(room);
  }
  return rooms;
}

function overlaps(a, b, gap) {
  return a.x - gap < b.x + b.w && b.x - gap < a.x + a.w && a.y - gap < b.y + b.h && b.y - gap < a.y + a.h;
}

function center(room) {
  return { tx: room.x + Math.floor(room.w / 2), ty: room.y + Math.floor(room.h / 2) };
}

function distance(a, b) {
  const ca = center(a);
  const cb = center(b);
  return Math.abs(ca.tx - cb.tx) + Math.abs(ca.ty - cb.ty);
}

// L-shaped corridor between room centers, DUNGEON_CORRIDOR_WIDTH tiles wide.
function carveCorridor(a, b, horizontalFirst, carve) {
  const from = center(a);
  const to = center(b);
  const corner = horizontalFirst ? { tx: to.tx, ty: from.ty } : { tx: from.tx, ty: to.ty };
  for (const [p, q] of [[from, corner], [corner, to]]) {
    for (let x = Math.min(p.tx, q.tx); x <= Math.max(p.tx, q.tx); x++) {
      for (let y = Math.min(p.ty, q.ty); y <= Math.max(p.ty, q.ty); y++) {
        for (let dy = 0; dy < DUNGEON_CORRIDOR_WIDTH; dy++) {
          for (let dx = 0; dx < DUNGEON_CORRIDOR_WIDTH; dx++) carve(x + dx, y + dy);
        }
      }
    }
  }
}

// 4-way BFS over walkable tiles; returns per-tile distances (-1 = unreachable) and parent indices.
function floodFrom(tiles, origin) {
  const size = DUNGEON_SIZE;
  const distances = new Int32Array(size * size).fill(-1);
  const parents = new Int32Array(size * size).fill(-1);
  const start = origin.ty * size + origin.tx;
  distances[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % size;
    const y = (i - x) / size;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const n = ny * size + nx;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || distances[n] !== -1 || isSolid(tiles[n])) continue;
      distances[n] = distances[i] + 1;
      parents[n] = i;
      queue.push(n);
    }
  }
  return { distances, parents };
}

// Walks the shortest path back from the end room and returns the first other room it passes through.
function roomBeforeEnd(rooms, endRoom, startRoom, end, parents) {
  const size = DUNGEON_SIZE;
  const inRoom = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  for (let i = end.ty * size + end.tx; i !== -1; i = parents[i]) {
    const x = i % size;
    const y = (i - x) / size;
    const room = rooms.find((r) => r !== endRoom && inRoom(r, x, y));
    if (room) return room === startRoom ? null : room;
  }
  return null;
}
