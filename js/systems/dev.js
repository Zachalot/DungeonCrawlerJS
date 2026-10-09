import { TILE_SIZE, WORLD_SIZE } from "../config.js";
import { dungeonsInRect } from "../world/dungeons.js";
import { VILLAGE_SPAWN } from "../world/village.js";
import { grantXp, xpToNext } from "./leveling.js";

// Developer cheats for playtesting, used by the dev panel (` key). DOM-free so they're testable.

const T = TILE_SIZE;
const KILL_RADIUS = 12; // tiles

export function addGold(game, amount) {
  game.player.gold += amount;
}

export function addXp(game, amount) {
  const levels = grantXp(game.player, amount);
  if (levels) game.toast(`Level up! You are level ${game.player.level}.`);
}

export function levelUp(game) {
  addXp(game, xpToNext(game.player.level) - game.player.xp);
}

export function teleportToVillage(game) {
  if (game.inDungeon) game.exitDungeon({ toVillage: true });
  else game.player.teleport(VILLAGE_SPAWN.x, VILLAGE_SPAWN.y);
}

/** Moves to just below the closest dungeon entrance on the overworld (leaving any dungeon first). */
export function teleportToNearestDungeon(game) {
  if (game.inDungeon) game.exitDungeon();
  const { tileX, tileY } = game.player;
  const nearest = dungeonsInRect(game.world.seed, 0, 0, WORLD_SIZE - 1, WORLD_SIZE - 1)
    .map((d) => ({ d, distance: Math.hypot(d.tx - tileX, d.ty - tileY) }))
    .sort((a, b) => a.distance - b.distance)
    .find(({ distance }) => distance > 1.5)?.d; // skip the one you're standing on
  if (!nearest) return false;
  game.player.teleport((nearest.tx + 0.5) * T, (nearest.ty + 1.5) * T);
  return true;
}

export function teleportToGrave(game) {
  if (!game.grave) {
    game.toast("You don't have a grave");
    return false;
  }
  if (game.inDungeon) game.exitDungeon();
  game.player.teleport(game.grave.x, game.grave.y + T);
  return true;
}

/** Kills every zombie within KILL_RADIUS tiles (with the normal XP and drops). Returns the count. */
export function killNearby(game) {
  const { x, y } = game.player;
  const victims = game.zombies.filter((z) => !z.dead && Math.hypot(z.x - x, z.y - y) <= KILL_RADIUS * T);
  for (const zombie of victims) game.damageZombie(zombie, zombie.hp);
  return victims.length;
}

/** Explores the entire current area. */
export function revealMap(game) {
  const tilesWide = Math.ceil(game.area.widthPx / T);
  const tilesHigh = Math.ceil(game.area.heightPx / T);
  game.currentFog.revealRect(0, 0, tilesWide - 1, tilesHigh - 1);
}

export function toggleGodMode(game) {
  game.godMode = !game.godMode;
  return game.godMode;
}

export function toggleHitboxes(game) {
  game.showHitboxes = !game.showHitboxes;
  return game.showHitboxes;
}
