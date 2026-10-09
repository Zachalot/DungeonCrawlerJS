import {
  CHUNK_SIZE,
  ENEMY_ACTIVE_CHUNK_RADIUS,
  ENEMY_DESPAWN_CHUNK_RADIUS,
  ENEMY_RESPAWN_TIME,
  SPAWN_CHECK_INTERVAL,
  TILE_SIZE,
} from "../config.js";
import { NORMAL_ENEMIES } from "../data/enemies.js";
import { Enemy, EnemyState } from "../entities/enemy.js";
import { Purpose, hash } from "../rng.js";
import { enemyAtLevel, levelAt, typesAtLevel } from "./scaling.js";

/**
 * Keeps overworld enemies alive only near the player. Each spawn point holds at most one
 * enemy, always the same type, at the level of where it stands (higher farther from the
 * village). A killed enemy's point reactivates after ENEMY_RESPAWN_TIME, and only spawns
 * while off-screen.
 */
export class Spawner {
  constructor(world, random = Math.random) {
    this.world = world;
    this.random = random;
    this.alive = new Map(); // spawnId → enemy
    this.respawnAt = new Map(); // spawnId → game time
    this.timer = SPAWN_CHECK_INTERVAL; // check on the first update
  }

  /** The scaled enemy definition a spawn point produces. */
  enemyFor(spawn) {
    const level = levelAt(spawn.tx, spawn.ty);
    const types = typesAtLevel(level, NORMAL_ENEMIES);
    return enemyAtLevel(types[hash(this.world.seed, spawn.tx, spawn.ty, Purpose.SPAWN_TYPE) % types.length], level);
  }

  /** Adds and removes enemies in `enemies` (mutated in place). `view` is the camera rect in px, or null. */
  update(dt, time, player, enemies, view) {
    this.timer += dt;
    if (this.timer < SPAWN_CHECK_INTERVAL) return;
    this.timer = 0;

    const playerChunkX = Math.floor(player.x / TILE_SIZE / CHUNK_SIZE);
    const playerChunkY = Math.floor(player.y / TILE_SIZE / CHUNK_SIZE);

    for (let cy = playerChunkY - ENEMY_ACTIVE_CHUNK_RADIUS; cy <= playerChunkY + ENEMY_ACTIVE_CHUNK_RADIUS; cy++) {
      for (let cx = playerChunkX - ENEMY_ACTIVE_CHUNK_RADIUS; cx <= playerChunkX + ENEMY_ACTIVE_CHUNK_RADIUS; cx++) {
        for (const spawn of this.world.getChunk(cx, cy).spawns) {
          if (this.alive.has(spawn.id)) continue;
          if ((this.respawnAt.get(spawn.id) ?? -Infinity) > time) continue;
          if (isInView(spawn, view)) continue;
          const enemy = new Enemy(this.enemyFor(spawn), spawn, this.random);
          this.alive.set(spawn.id, enemy);
          enemies.push(enemy);
        }
      }
    }

    // Despawn calm enemies whose home chunk drifted far from the player. They respawn when it's near again.
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const chunkX = Math.floor(e.homeX / TILE_SIZE / CHUNK_SIZE);
      const chunkY = Math.floor(e.homeY / TILE_SIZE / CHUNK_SIZE);
      const far = Math.max(Math.abs(chunkX - playerChunkX), Math.abs(chunkY - playerChunkY)) > ENEMY_DESPAWN_CHUNK_RADIUS;
      const calm = e.state === EnemyState.IDLE || e.state === EnemyState.RETURN;
      if (far && calm) {
        enemies.splice(i, 1);
        this.alive.delete(e.spawnId);
      }
    }
  }

  onEnemyKilled(enemy, time) {
    this.alive.delete(enemy.spawnId);
    this.respawnAt.set(enemy.spawnId, time + ENEMY_RESPAWN_TIME);
  }
}

function isInView(spawn, view) {
  if (!view) return false;
  const x = (spawn.tx + 0.5) * TILE_SIZE;
  const y = (spawn.ty + 0.5) * TILE_SIZE;
  const margin = TILE_SIZE;
  return x >= view.x - margin && x <= view.x + view.width + margin && y >= view.y - margin && y <= view.y + view.height + margin;
}
