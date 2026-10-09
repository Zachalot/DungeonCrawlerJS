import { HIT_FLASH_TIME, KNOCKBACK_TIME, PLAYER_SPEED, TILE_SIZE } from "../config.js";
import { moveAndCollide } from "../world/collision.js";

const T = TILE_SIZE;
const ARRIVE_DISTANCE = 0.25 * T;
const WINDUP_RANGE_LEEWAY = 1.25; // the hit still lands if the player stepped slightly away
const WANDER_PAUSE = [1.5, 4]; // s between wander moves
const HOP_PERIOD = 0.9; // s per hop for "hop" movers (slimes)…
const HOP_AIRBORNE = 0.4; // …of which they're moving this share, at 1 / HOP_AIRBORNE speed

export const EnemyState = Object.freeze({
  IDLE: "idle",
  CHASE: "chase",
  WINDUP: "windup",
  RETURN: "return",
});

/**
 * Melee chaser AI: idle-wander → chase → windup → attack, returning home on de-aggro.
 * `def` is a level-scaled definition (systems/scaling.js enemyAtLevel). Slimes hop: they cover
 * the same average distance in bursts.
 */
export class Enemy {
  constructor(def, spawn, random = Math.random) {
    this.def = def;
    this.level = def.level;
    this.spawnId = spawn.id;
    this.homeX = (spawn.tx + 0.5) * T;
    this.homeY = (spawn.ty + 0.5) * T;
    this.x = this.prevX = this.homeX;
    this.y = this.prevY = this.homeY;
    this.half = (def.size * T) / 2;
    this.speed = def.speed * PLAYER_SPEED * T;
    this.random = random;

    this.hp = def.hp;
    this.state = EnemyState.IDLE;
    this.stateTime = 0;
    this.wanderTarget = null;
    this.wanderPause = 0;
    this.attackCooldown = 0;
    this.flash = 0;
    this.knockback = null; // { vx, vy, time }
    this.facing = 0;
    this.hopTime = random() * HOP_PERIOD; // desynchronises a pack's hops
    this.dead = false;
  }

  /**
   * One fixed step. `ctx` supplies { player, playerSafe, canSee(x0, y0, x1, y1), solids, onAttack(enemy) }.
   * `solids` is the collision world enemies use (the village counts as solid).
   */
  update(dt, ctx) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.stateTime += dt;
    this.hopTime = (this.hopTime + dt) % HOP_PERIOD;
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
      case EnemyState.IDLE:
      case EnemyState.RETURN:
        if (this.canAggro(ctx, distance)) {
          this.setState(EnemyState.CHASE);
        } else if (this.state === EnemyState.IDLE) {
          this.wander(dt, ctx);
        } else {
          this.returnHome(dt, ctx);
        }
        break;

      case EnemyState.CHASE:
        if (ctx.playerSafe || distance > this.def.deaggroRadius * T) {
          this.setState(EnemyState.RETURN);
          break;
        }
        this.facing = Math.atan2(player.y - this.y, player.x - this.x);
        const gap = distance - this.def.stopDistance * T;
        if (gap > 0) this.moveToward(player.x, player.y, Math.min(this.stride(dt), gap), ctx);
        if (distance <= this.def.attackRange * T && this.attackCooldown === 0) this.setState(EnemyState.WINDUP);
        break;

      case EnemyState.WINDUP:
        this.facing = Math.atan2(player.y - this.y, player.x - this.x);
        if (this.stateTime < this.def.windup) break;
        if (!ctx.playerSafe && distance <= this.def.attackRange * T * WINDUP_RANGE_LEEWAY) ctx.onAttack(this);
        this.attackCooldown = this.def.attackCooldown;
        this.setState(EnemyState.CHASE);
        break;
    }
  }

  /** Distance covered this step at full speed: steady for walkers, in bursts for hoppers. */
  stride(dt) {
    if (this.def.movement !== "hop") return this.speed * dt;
    return this.airborne ? (this.speed * dt) / HOP_AIRBORNE : 0;
  }

  /** True mid-hop (for hoppers); drawn lifted off the ground. */
  get airborne() {
    return this.def.movement === "hop" && this.hopTime < HOP_PERIOD * HOP_AIRBORNE;
  }

  /** 0 → 1 → 0 over a hop, for drawing the jump. */
  get hopLift() {
    if (!this.airborne) return 0;
    return Math.sin((this.hopTime / (HOP_PERIOD * HOP_AIRBORNE)) * Math.PI);
  }

  /** Applies damage; returns true if this killed the enemy. */
  takeHit(damage, knockbackAngle = null, knockbackTiles = 0) {
    this.hp -= damage;
    this.flash = HIT_FLASH_TIME;
    if (this.hp <= 0) {
      this.dead = true;
      return true;
    }
    // Bosses are too heavy to knock back.
    if (knockbackAngle !== null && knockbackTiles > 0 && !this.def.boss) {
      const speed = (knockbackTiles * T) / KNOCKBACK_TIME;
      this.knockback = { vx: Math.cos(knockbackAngle) * speed, vy: Math.sin(knockbackAngle) * speed, time: KNOCKBACK_TIME };
    }
    // Getting hit always provokes and interrupts a windup, except a boss's: they power through.
    if (!this.def.boss || this.state !== EnemyState.WINDUP) this.setState(EnemyState.CHASE);
    return false;
  }

  /** Abandons any chase (used when the player respawns). */
  calmDown() {
    if (this.state === EnemyState.CHASE || this.state === EnemyState.WINDUP) this.setState(EnemyState.RETURN);
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
    const arrived = this.moveToward(target.x, target.y, this.stride(dt) * this.def.wanderSpeed, ctx);
    if (arrived || target.time > 4) {
      this.wanderTarget = null;
      this.wanderPause = WANDER_PAUSE[0] + this.random() * (WANDER_PAUSE[1] - WANDER_PAUSE[0]);
    }
  }

  returnHome(dt, ctx) {
    const arrived = this.moveToward(this.homeX, this.homeY, this.stride(dt), ctx);
    if (arrived || this.stateTime > this.def.returnTimeout) {
      if (!arrived) {
        this.x = this.prevX = this.homeX;
        this.y = this.prevY = this.homeY;
      }
      this.hp = this.def.hp;
      this.setState(EnemyState.IDLE);
    }
  }

  // Returns true once within ARRIVE_DISTANCE of the target.
  moveToward(tx, ty, step, ctx) {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= ARRIVE_DISTANCE) return true;
    if (step <= 0) return false;
    const move = Math.min(step, distance);
    this.facing = Math.atan2(dy, dx);
    moveAndCollide(ctx.solids, this, (dx / distance) * move, (dy / distance) * move);
    return false;
  }
}
