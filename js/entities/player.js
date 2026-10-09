import { PLAYER_SIZE, PLAYER_SPEED, STARTING_ARROWS, STARTING_GOLD, STARTING_STATS, TILE_SIZE } from "../config.js";
import { maxHp, maxMana } from "../systems/stats.js";
import { moveAndCollide } from "../world/collision.js";

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.half = (PLAYER_SIZE * TILE_SIZE) / 2;
    this.aimAngle = 0;

    this.level = 1;
    this.xp = 0; // progress toward the next level
    this.unspentPoints = 0;
    this.gold = STARTING_GOLD;
    this.stats = { ...STARTING_STATS };
    this.hp = maxHp(this.stats);
    this.mana = maxMana(this.stats);
    this.arrows = STARTING_ARROWS;
    this.armor = 0; // from equipment in M4

    this.weapon = "sword";
    this.attackCooldown = 0; // s until the next attack is allowed
    this.attackBuffer = 0; // s a recent click keeps waiting for the cooldown
    this.iframes = 0; // s of remaining invulnerability
    this.flash = 0; // s of remaining hit flash
    this.lastCombatTime = -Infinity;
    this.regenRemainder = { hp: 0, mana: 0 };
  }

  /** Advances movement and aim one fixed step; `move` is a direction vector, `aim` a world-px point. */
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

  /** Moves to a point without interpolating from the old position. */
  teleport(x, y) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
  }

  get tileX() {
    return Math.floor(this.x / TILE_SIZE);
  }

  get tileY() {
    return Math.floor(this.y / TILE_SIZE);
  }
}
