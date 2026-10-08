import { HIT_FLASH_TIME, KNOCKBACK_TIME, PLAYER_SPEED, TILE_SIZE } from "../config.js";
import { moveAndCollide } from "../world/collision.js";

const T = TILE_SIZE;
const ARRIVE_DISTANCE = 0.25 * T;
const WINDUP_RANGE_LEEWAY = 1.25; // the hit still lands if the player stepped slightly away
const WANDER_PAUSE = [1.5, 4]; // s between wander moves

export const ZombieState = Object.freeze({
  IDLE: "idle",
  CHASE: "chase",
  WINDUP: "windup",
  RETURN: "return",
});

/** Melee chaser AI: idle-wander → chase → windup → attack, returning home on de-aggro. */
export class Zombie {
  constructor(def, spawn, random = Math.random) {
    this.def = def;
    this.spawnId = spawn.id;
    this.homeX = (spawn.tx + 0.5) * T;
    this.homeY = (spawn.ty + 0.5) * T;
    this.x = this.prevX = this.homeX;
    this.y = this.prevY = this.homeY;
    this.half = (def.size * T) / 2;
    this.speed = def.speed * PLAYER_SPEED * T;
    this.random = random;

    this.hp = def.hp;
    this.state = ZombieState.IDLE;
    this.stateTime = 0;
    this.wanderTarget = null;
    this.wanderPause = 0;
    this.attackCooldown = 0;
    this.flash = 0;
    this.knockback = null; // { vx, vy, time }
    this.facing = 0;
    this.dead = false;
  }

  /**
   * One fixed step. `ctx` supplies { player, playerSafe, canSee(x0, y0, x1, y1), solids, onAttack(zombie) }.
   * `solids` is the collision world zombies use (the village counts as solid).
   */
  update(dt, ctx) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.stateTime += dt;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.flash = Math.max(0, this.flash - dt);

    if (this.knockback) {
      const k = this.knockback;
      const step = Math.min(dt, k.time);
      moveAndCollide(ctx.solids, this, k.vx * step, k.vy * step);
      k.time -= step;
      if (k.time <= 0) this.knockback = null;
      return;
    }

    const { player } = ctx;
    const distance = Math.hypot(player.x - this.x, player.y - this.y);

    switch (this.state) {
      case ZombieState.IDLE:
      case ZombieState.RETURN:
        if (this.canAggro(ctx, distance)) {
          this.setState(ZombieState.CHASE);
        } else if (this.state === ZombieState.IDLE) {
          this.wander(dt, ctx);
        } else {
          this.returnHome(dt, ctx);
        }
        break;

      case ZombieState.CHASE:
        if (ctx.playerSafe || distance > this.def.deaggroRadius * T) {
          this.setState(ZombieState.RETURN);
          break;
        }
        this.facing = Math.atan2(player.y - this.y, player.x - this.x);
        const gap = distance - this.def.stopDistance * T;
        if (gap > 0) this.moveToward(player.x, player.y, Math.min(this.speed * dt, gap), ctx);
        if (distance <= this.def.attackRange * T && this.attackCooldown === 0) this.setState(ZombieState.WINDUP);
        break;

      case ZombieState.WINDUP:
        this.facing = Math.atan2(player.y - this.y, player.x - this.x);
        if (this.stateTime < this.def.windup) break;
        if (!ctx.playerSafe && distance <= this.def.attackRange * T * WINDUP_RANGE_LEEWAY) ctx.onAttack(this);
        this.attackCooldown = this.def.attackCooldown;
        this.setState(ZombieState.CHASE);
        break;
    }
  }

  /** Applies damage; returns true if this killed the zombie. */
  takeHit(damage, knockbackAngle = null, knockbackTiles = 0) {
    this.hp -= damage;
    this.flash = HIT_FLASH_TIME;
    if (this.hp <= 0) {
      this.dead = true;
      return true;
    }
    if (knockbackAngle !== null && knockbackTiles > 0) {
      const speed = (knockbackTiles * T) / KNOCKBACK_TIME;
      this.knockback = { vx: Math.cos(knockbackAngle) * speed, vy: Math.sin(knockbackAngle) * speed, time: KNOCKBACK_TIME };
    }
    // Getting hit always provokes, and a knockback interrupts a windup.
    this.setState(ZombieState.CHASE);
    return false;
  }

  /** Abandons any chase (used when the player respawns). */
  calmDown() {
    if (this.state === ZombieState.CHASE || this.state === ZombieState.WINDUP) this.setState(ZombieState.RETURN);
  }

  renderPosition(alpha) {
    return { x: this.prevX + (this.x - this.prevX) * alpha, y: this.prevY + (this.y - this.prevY) * alpha };
  }

  canAggro(ctx, distance) {
    return !ctx.playerSafe && distance <= this.def.aggroRadius * T && ctx.canSee(this.x, this.y, ctx.player.x, ctx.player.y);
  }

  setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.stateTime = 0;
    this.wanderTarget = null;
  }

  wander(dt, ctx) {
    if (!this.wanderTarget) {
      this.wanderPause -= dt;
      if (this.wanderPause > 0) return;
      const angle = this.random() * Math.PI * 2;
      const radius = this.random() * this.def.wanderRadius * T;
      this.wanderTarget = { x: this.homeX + Math.cos(angle) * radius, y: this.homeY + Math.sin(angle) * radius, time: 0 };
    }
    const target = this.wanderTarget;
    target.time += dt;
    const arrived = this.moveToward(target.x, target.y, this.speed * this.def.wanderSpeed * dt, ctx);
    if (arrived || target.time > 4) {
      this.wanderTarget = null;
      this.wanderPause = WANDER_PAUSE[0] + this.random() * (WANDER_PAUSE[1] - WANDER_PAUSE[0]);
    }
  }

  returnHome(dt, ctx) {
    const arrived = this.moveToward(this.homeX, this.homeY, this.speed * dt, ctx);
    if (arrived || this.stateTime > this.def.returnTimeout) {
      if (!arrived) {
        this.x = this.prevX = this.homeX;
        this.y = this.prevY = this.homeY;
      }
      this.hp = this.def.hp;
      this.setState(ZombieState.IDLE);
    }
  }

  // Returns true once within ARRIVE_DISTANCE of the target.
  moveToward(tx, ty, step, ctx) {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= ARRIVE_DISTANCE) return true;
    const move = Math.min(step, distance);
    this.facing = Math.atan2(dy, dx);
    moveAndCollide(ctx.solids, this, (dx / distance) * move, (dy / distance) * move);
    return false;
  }
}
