import { DUNGEON_LEVEL_DISTANCE, TILE_SIZE } from "../config.js";
import { MATERIAL_TYPES, RUNE_TYPES } from "../data/enemies.js";
import { dungeonsInRect } from "../world/dungeons.js";
import { VILLAGE_CENTER_TILE, VILLAGE_SPAWN } from "../world/village.js";
import { addItem, countItem } from "./inventory.js";
import { grantXp, xpToNext } from "./leveling.js";
import { levelAt } from "./scaling.js";

// Developer cheats for playtesting, used by the dev panel (` key). DOM-free so they're testable.

const T = TILE_SIZE;
const KILL_RADIUS = 12; // tiles
const SEARCH_RADIUS = 200; // tiles around the player to look for dungeons
const REVEAL_RADIUS = 120; // tiles: the overworld is endless, so reveal a square around you

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

function teleportBelow(game, entrance) {
  game.player.teleport((entrance.tx + 0.5) * T, (entrance.ty + 1.5) * T);
}

/** Moves to just below the closest dungeon entrance on the overworld (leaving any dungeon first). */
export function teleportToNearestDungeon(game) {
  if (game.inDungeon) game.exitDungeon();
  const { tileX, tileY } = game.player;
  const nearest = dungeonsInRect(game.world.seed, tileX - SEARCH_RADIUS, tileY - SEARCH_RADIUS, tileX + SEARCH_RADIUS, tileY + SEARCH_RADIUS)
    .map((d) => ({ d, distance: Math.hypot(d.tx - tileX, d.ty - tileY) }))
    .sort((a, b) => a.distance - b.distance)
    .find(({ distance }) => distance > 1.5)?.d; // skip the one you're standing on
  if (!nearest) return false;
  teleportBelow(game, nearest);
  return true;
}

/** Moves to a dungeon one level above the area you're in (the endless world gets harder outward). Returns its level. */
export function teleportToDeeperDungeon(game) {
  const here = game.inDungeon ? game.area.level : levelAt(game.player.tileX, game.player.tileY);
  if (game.inDungeon) game.exitDungeon();
  const target = here + 1;
  // Dungeons of level N sit about (N − 1) × DUNGEON_LEVEL_DISTANCE tiles from the village; look along a ring there.
  const r = target * DUNGEON_LEVEL_DISTANCE + DUNGEON_LEVEL_DISTANCE;
  const c = VILLAGE_CENTER_TILE;
  const { tileX, tileY } = game.player;
  const found = dungeonsInRect(game.world.seed, c - r, c - r, c + r, c + r)
    .filter((d) => d.level === target)
    .sort((a, b) => Math.hypot(a.tx - tileX, a.ty - tileY) - Math.hypot(b.tx - tileX, b.ty - tileY))[0];
  if (!found) return null;
  teleportBelow(game, found);
  return target;
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

/** Kills every enemy within KILL_RADIUS tiles (with the normal XP and drops). Returns the count. */
export function killNearby(game) {
  const { x, y } = game.player;
  const victims = game.enemies.filter((e) => !e.dead && Math.hypot(e.x - x, e.y - y) <= KILL_RADIUS * T);
  for (const enemy of victims) game.damageEnemy(enemy, enemy.hp);
  return victims.length;
}

/** Explores the current dungeon floor, or a large square of the overworld around you. */
export function revealMap(game) {
  if (game.inDungeon) {
    game.currentFog.revealRect(0, 0, Math.ceil(game.area.widthPx / T) - 1, Math.ceil(game.area.heightPx / T) - 1);
    return;
  }
  const { tileX, tileY } = game.player;
  game.currentFog.revealRect(tileX - REVEAL_RADIUS, tileY - REVEAL_RADIUS, tileX + REVEAL_RADIUS, tileY + REVEAL_RADIUS);
}

/** +100 wood and stone, +20 of each goop. */
export function addMaterials(game) {
  for (const id of MATERIAL_TYPES) game.player.materials[id] += id === "wood" || id === "stone" ? 100 : 20;
}

/** +5 of every rune. */
export function addRunes(game) {
  for (const id of RUNE_TYPES) game.player.runes[id] += 5;
}

/** An axe and a pickaxe, if you don't have them. Returns how many were added. */
export function addTools(game) {
  let added = 0;
  for (const id of ["starter_axe", "starter_pickaxe"]) {
    if (countItem(game.player.inventory, id) === 0 && addItem(game.player.inventory, id, 1, game.newUid) === 0) added++;
  }
  return added;
}

export function toggleGodMode(game) {
  game.godMode = !game.godMode;
  return game.godMode;
}

export function toggleHitboxes(game) {
  game.showHitboxes = !game.showHitboxes;
  return game.showHitboxes;
}
