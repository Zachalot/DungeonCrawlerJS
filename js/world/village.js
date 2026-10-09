import { TILE_SIZE, VILLAGE_BUFFER, VILLAGE_GATE_WIDTH, VILLAGE_SIZE, WORLD_SIZE } from "../config.js";
import { Tile } from "./tiles.js";

export const VILLAGE_ORIGIN = Math.floor((WORLD_SIZE - VILLAGE_SIZE) / 2);
const VILLAGE_END = VILLAGE_ORIGIN + VILLAGE_SIZE - 1;
const GATE_START = VILLAGE_ORIGIN + Math.floor((VILLAGE_SIZE - VILLAGE_GATE_WIDTH) / 2);
const GATE_END = GATE_START + VILLAGE_GATE_WIDTH - 1;

/** Village center in tile units (a tile boundary for even sizes). */
export const VILLAGE_CENTER_TILE = VILLAGE_ORIGIN + VILLAGE_SIZE / 2;

/** Player spawn point in world pixels. */
export const VILLAGE_SPAWN = Object.freeze({
  x: VILLAGE_CENTER_TILE * TILE_SIZE,
  y: VILLAGE_CENTER_TILE * TILE_SIZE,
});

/** Interactables, one per inner corner of the village. `id` doubles as the panel it opens. */
export const VILLAGE_NPCS = Object.freeze([
  { id: "trainer", kind: "npc", name: "Respec Trainer", tx: VILLAGE_ORIGIN + 2, ty: VILLAGE_ORIGIN + 2, color: "#8b5cf6" },
  { id: "potionVendor", kind: "npc", name: "Potion Vendor", tx: VILLAGE_END - 2, ty: VILLAGE_ORIGIN + 2, color: "#ec4899" },
  { id: "generalVendor", kind: "npc", name: "General Vendor", tx: VILLAGE_ORIGIN + 2, ty: VILLAGE_END - 2, color: "#f59e0b" },
  { id: "stash", kind: "stash", name: "Stash", tx: VILLAGE_END - 2, ty: VILLAGE_END - 2, color: "#a16207" },
]);

/** True for tiles inside the village walls, walls included. */
export function isInVillage(tx, ty) {
  return tx >= VILLAGE_ORIGIN && tx <= VILLAGE_END && ty >= VILLAGE_ORIGIN && ty <= VILLAGE_END;
}

/** True for the village plus its obstacle-free buffer ring. */
export function isInVillageBuffer(tx, ty) {
  return (
    tx >= VILLAGE_ORIGIN - VILLAGE_BUFFER &&
    tx <= VILLAGE_END + VILLAGE_BUFFER &&
    ty >= VILLAGE_ORIGIN - VILLAGE_BUFFER &&
    ty <= VILLAGE_END + VILLAGE_BUFFER
  );
}

const isGateLine = (n) => n >= GATE_START && n <= GATE_END;

/** Tile for a coordinate inside the village: walls on the edge with a gate gap per side. */
export function villageTile(tx, ty) {
  const onEdge = tx === VILLAGE_ORIGIN || tx === VILLAGE_END || ty === VILLAGE_ORIGIN || ty === VILLAGE_END;
  if (!onEdge) return Tile.VILLAGE_FLOOR;
  const isGate = ((ty === VILLAGE_ORIGIN || ty === VILLAGE_END) && isGateLine(tx)) ||
    ((tx === VILLAGE_ORIGIN || tx === VILLAGE_END) && isGateLine(ty));
  return isGate ? Tile.VILLAGE_FLOOR : Tile.VILLAGE_WALL;
}

/** Tile for a coordinate in the buffer ring: paths lead out of each gate. */
export function bufferTile(tx, ty) {
  const inColumn = tx >= VILLAGE_ORIGIN && tx <= VILLAGE_END;
  const inRow = ty >= VILLAGE_ORIGIN && ty <= VILLAGE_END;
  if ((isGateLine(tx) && !inRow) || (isGateLine(ty) && !inColumn)) return Tile.PATH;
  return Tile.GRASS;
}
