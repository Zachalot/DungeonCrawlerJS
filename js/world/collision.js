import { TILE_SIZE } from "../config.js";

const EDGE_EPSILON = 1e-6;

/**
 * Moves a square body ({ x, y, half }, centered, in px) by (dx, dy), stopping
 * flush against solid tiles. Axes resolve separately so the body slides along walls.
 */
export function moveAndCollide(world, body, dx, dy) {
  moveAxis(world, body, "x", dx);
  moveAxis(world, body, "y", dy);
}

/** Returns true if the body currently overlaps any solid tile. */
export function overlapsSolid(world, body) {
  return findBlockingTile(world, body, "x", 0) !== null;
}

function moveAxis(world, body, axis, delta) {
  if (delta === 0) return;
  body[axis] += delta;
  const blocking = findBlockingTile(world, body, axis, delta);
  if (blocking === null) return;
  body[axis] = delta > 0 ? blocking * TILE_SIZE - body.half : (blocking + 1) * TILE_SIZE + body.half;
}

// Returns the nearest blocking tile index along `axis` in the direction of travel, or null.
function findBlockingTile(world, body, axis, delta) {
  const left = Math.floor((body.x - body.half) / TILE_SIZE);
  const right = Math.floor((body.x + body.half - EDGE_EPSILON) / TILE_SIZE);
  const top = Math.floor((body.y - body.half) / TILE_SIZE);
  const bottom = Math.floor((body.y + body.half - EDGE_EPSILON) / TILE_SIZE);

  let nearest = null;
  for (let ty = top; ty <= bottom; ty++) {
    for (let tx = left; tx <= right; tx++) {
      if (!world.isSolidAt(tx, ty)) continue;
      const index = axis === "x" ? tx : ty;
      if (nearest === null || (delta >= 0 ? index < nearest : index > nearest)) nearest = index;
    }
  }
  return nearest;
}
