import { PLAYER_SIZE, PLAYER_SPEED, TILE_SIZE } from "../config.js";
import { moveAndCollide } from "../world/collision.js";

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.half = (PLAYER_SIZE * TILE_SIZE) / 2;
    this.aimAngle = 0;
  }

  /** Advances one fixed step; `move` is a direction vector, `aim` a world-px point. */
  update(dt, move, aim, world) {
    this.prevX = this.x;
    this.prevY = this.y;

    const length = Math.hypot(move.x, move.y);
    if (length > 0) {
      const step = PLAYER_SPEED * TILE_SIZE * dt;
      moveAndCollide(world, this, (move.x / length) * step, (move.y / length) * step);
    }
    this.aimAngle = Math.atan2(aim.y - this.y, aim.x - this.x);
  }

  /** Position interpolated between the last two fixed steps. */
  renderPosition(alpha) {
    return {
      x: this.prevX + (this.x - this.prevX) * alpha,
      y: this.prevY + (this.y - this.prevY) * alpha,
    };
  }

  get tileX() {
    return Math.floor(this.x / TILE_SIZE);
  }

  get tileY() {
    return Math.floor(this.y / TILE_SIZE);
  }
}
