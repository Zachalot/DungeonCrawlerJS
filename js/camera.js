import { TILE_SIZE, WORLD_SIZE } from "./config.js";

/** Viewport into the world; (x, y) is the top-left corner in world px. */
export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.width = 0;
    this.height = 0;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  /** Centers on a point, clamped so the view never leaves the world. */
  follow(targetX, targetY) {
    const worldPx = WORLD_SIZE * TILE_SIZE;
    this.x = Math.round(clamp(targetX - this.width / 2, 0, Math.max(0, worldPx - this.width)));
    this.y = Math.round(clamp(targetY - this.height / 2, 0, Math.max(0, worldPx - this.height)));
  }

  screenToWorld(sx, sy) {
    return { x: sx + this.x, y: sy + this.y };
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
