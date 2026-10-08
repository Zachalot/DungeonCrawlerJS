import { TILE_SIZE } from "../config.js";

/** Straight-flying arrow or fireball that stops at solid tiles or the first enemy it touches. */
export class Projectile {
  constructor({ kind, x, y, angle, speed, range, radius, damage }) {
    this.kind = kind;
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.angle = angle;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.remaining = range; // px
    this.radius = radius;
    this.damage = damage;
    this.dead = false;
  }

  /** Moves one step; returns the enemy hit, or null. Sets `dead` on any impact or at max range. */
  update(dt, world, enemies) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.remaining -= Math.hypot(this.vx, this.vy) * dt;

    if (world.isSolidAt(Math.floor(this.x / TILE_SIZE), Math.floor(this.y / TILE_SIZE))) {
      this.dead = true;
      return null;
    }
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      if (Math.hypot(enemy.x - this.x, enemy.y - this.y) <= enemy.half + this.radius) {
        this.dead = true;
        return enemy;
      }
    }
    if (this.remaining <= 0) this.dead = true;
    return null;
  }

  renderPosition(alpha) {
    return { x: this.prevX + (this.x - this.prevX) * alpha, y: this.prevY + (this.y - this.prevY) * alpha };
  }
}
