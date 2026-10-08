import {
  CHUNK_SIZE,
  ENEMY_ACTIVE_CHUNK_RADIUS,
  ENEMY_DESPAWN_CHUNK_RADIUS,
  ENEMY_RESPAWN_TIME,
  SPAWN_CHECK_INTERVAL,
  TILE_SIZE,
} from "../config.js";
import { Zombie, ZombieState } from "../entities/zombie.js";

/**
 * Keeps zombies alive only near the player. Each spawn point holds at most one
 * zombie; a killed zombie's point reactivates after ENEMY_RESPAWN_TIME, and
 * only spawns while off-screen.
 */
export class Spawner {
  constructor(world, enemyDef, random = Math.random) {
    this.world = world;
    this.enemyDef = enemyDef;
    this.random = random;
    this.alive = new Map(); // spawnId → zombie
    this.respawnAt = new Map(); // spawnId → game time
    this.timer = SPAWN_CHECK_INTERVAL; // check on the first update
  }

  /** Adds and removes zombies in `zombies` (mutated in place). `view` is the camera rect in px, or null. */
  update(dt, time, player, zombies, view) {
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
          const zombie = new Zombie(this.enemyDef, spawn, this.random);
          this.alive.set(spawn.id, zombie);
          zombies.push(zombie);
        }
      }
    }

    // Despawn calm zombies whose home chunk drifted far from the player. They respawn when it's near again.
    for (let i = zombies.length - 1; i >= 0; i--) {
      const z = zombies[i];
      const chunkX = Math.floor(z.homeX / TILE_SIZE / CHUNK_SIZE);
      const chunkY = Math.floor(z.homeY / TILE_SIZE / CHUNK_SIZE);
      const far = Math.max(Math.abs(chunkX - playerChunkX), Math.abs(chunkY - playerChunkY)) > ENEMY_DESPAWN_CHUNK_RADIUS;
      const calm = z.state === ZombieState.IDLE || z.state === ZombieState.RETURN;
      if (far && calm) {
        zombies.splice(i, 1);
        this.alive.delete(z.spawnId);
      }
    }
  }

  onZombieKilled(zombie, time) {
    this.alive.delete(zombie.spawnId);
    this.respawnAt.set(zombie.spawnId, time + ENEMY_RESPAWN_TIME);
  }
}

function isInView(spawn, view) {
  if (!view) return false;
  const x = (spawn.tx + 0.5) * TILE_SIZE;
  const y = (spawn.ty + 0.5) * TILE_SIZE;
  const margin = TILE_SIZE;
  return x >= view.x - margin && x <= view.x + view.width + margin && y >= view.y - margin && y <= view.y + view.height + margin;
}
