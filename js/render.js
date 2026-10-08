import { CHUNK_SIZE, TILE_SIZE } from "./config.js";
import { Tile } from "./world/tiles.js";
import { VILLAGE_CENTER_TILE, VILLAGE_ORIGIN } from "./world/village.js";

const T = TILE_SIZE;

const COLORS = {
  grass: ["#4f8a3c", "#548f40", "#4a8538", "#57923f"],
  path: ["#b89a6a", "#b39465"],
  villageFloor: ["#c9b48a", "#c3ad83"],
  wall: "#6b4a2f",
  wallTrim: "#4e3520",
  rock: "#8a8d91",
  rockShade: "#6c6f73",
  rockLight: "#a9acb0",
  trunk: "#5a3d22",
  canopy: "#2f6b2a",
  canopyLight: "#3d7f35",
  border: "#1f4a1c",
  entranceStone: "#5b5b63",
  entranceHole: "#141418",
  player: "#3b82f6",
  playerOutline: "#1e3a8a",
  aim: "#f8fafc",
  label: "#f8fafc",
  labelShadow: "rgba(0, 0, 0, 0.75)",
  shadow: "rgba(0, 0, 0, 0.25)",
  zombie: "#6b8f5e",
  zombieOutline: "#2f4a28",
  zombieWindup: "#c2563f",
  zombieEyes: "#fde047",
  hpBack: "rgba(0, 0, 0, 0.6)",
  hpFill: "#ef4444",
  flash: "#ffffff",
  arrowShaft: "#c8a26a",
  arrowTip: "#d1d5db",
  fireballCore: "#fde68a",
  fireballOuter: "#f97316",
  swing: "rgba(255, 255, 255, 0.35)",
};

/** Draws every tile intersecting the camera view. */
export function drawWorld(ctx, world, camera) {
  const startX = Math.floor(camera.x / T);
  const startY = Math.floor(camera.y / T);
  const endX = Math.floor((camera.x + camera.width) / T);
  const endY = Math.floor((camera.y + camera.height) / T);

  for (let ty = startY; ty <= endY; ty++) {
    for (let tx = startX; tx <= endX; tx++) {
      const { tile, variant } = world.getTileInfo(tx, ty);
      drawTile(ctx, tile, variant, tx * T - camera.x, ty * T - camera.y);
    }
  }
}

/** Draws "Dungeon · Lv N" labels for entrances in chunks near the view, plus the village name. */
export function drawLabels(ctx, world, camera) {
  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  const firstChunkX = Math.floor(camera.x / T / CHUNK_SIZE);
  const firstChunkY = Math.floor(camera.y / T / CHUNK_SIZE);
  const lastChunkX = Math.floor((camera.x + camera.width) / T / CHUNK_SIZE);
  const lastChunkY = Math.floor((camera.y + camera.height) / T / CHUNK_SIZE);
  for (let cy = firstChunkY; cy <= lastChunkY; cy++) {
    for (let cx = firstChunkX; cx <= lastChunkX; cx++) {
      for (const d of world.getChunk(cx, cy).dungeons) {
        drawLabel(ctx, `Dungeon · Lv ${d.level}`, (d.tx + 0.5) * T - camera.x, d.ty * T - camera.y - 4);
      }
    }
  }
  drawLabel(ctx, "Village (safe zone)", VILLAGE_CENTER_TILE * T - camera.x, VILLAGE_ORIGIN * T - camera.y - 6);
}

/** Draws the player and zombies, sorted by y so lower sprites overlap higher ones. */
export function drawEntities(ctx, game, alpha, camera) {
  const drawables = [
    { y: game.player.y, draw: () => drawPlayer(ctx, game.player, alpha, camera) },
    ...game.zombies.map((z) => ({ y: z.y, draw: () => drawZombie(ctx, z, alpha, camera) })),
  ];
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();
}

export function drawProjectiles(ctx, projectiles, alpha, camera) {
  for (const p of projectiles) {
    const pos = p.renderPosition(alpha);
    const sx = pos.x - camera.x;
    const sy = pos.y - camera.y;
    if (p.kind === "fireball") {
      ctx.fillStyle = COLORS.fireballOuter;
      ctx.beginPath();
      ctx.arc(sx, sy, p.radius + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.fireballCore;
      ctx.beginPath();
      ctx.arc(sx, sy, p.radius - 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const cos = Math.cos(p.angle);
      const sin = Math.sin(p.angle);
      ctx.strokeStyle = COLORS.arrowShaft;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx - cos * 10, sy - sin * 10);
      ctx.lineTo(sx + cos * 4, sy + sin * 4);
      ctx.stroke();
      ctx.fillStyle = COLORS.arrowTip;
      ctx.beginPath();
      ctx.moveTo(sx + cos * 8, sy + sin * 8);
      ctx.lineTo(sx + cos * 3 - sin * 3, sy + sin * 3 + cos * 3);
      ctx.lineTo(sx + cos * 3 + sin * 3, sy + sin * 3 - cos * 3);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** Sword swings, impact puffs, and floating damage numbers. */
export function drawEffects(ctx, effects, camera) {
  for (const s of effects.swings) {
    const t = s.age / s.life;
    ctx.fillStyle = COLORS.swing;
    ctx.globalAlpha = 1 - t;
    ctx.beginPath();
    ctx.moveTo(s.x - camera.x, s.y - camera.y);
    ctx.arc(s.x - camera.x, s.y - camera.y, s.radius, s.angle - s.arc / 2, s.angle + s.arc / 2);
    ctx.closePath();
    ctx.fill();
  }
  for (const p of effects.puffs) {
    const t = p.age / p.life;
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x - camera.x, p.y - camera.y, 4 + t * 10, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (const e of effects.texts) {
    const t = e.age / e.life;
    const x = e.x - camera.x;
    const y = e.y - camera.y - 4 - t * 24;
    ctx.globalAlpha = 1 - t * t;
    ctx.fillStyle = COLORS.labelShadow;
    ctx.fillText(e.text, x + 1, y + 1);
    ctx.fillStyle = e.color;
    ctx.fillText(e.text, x, y);
  }
  ctx.globalAlpha = 1;
}

function drawPlayer(ctx, player, alpha, camera) {
  const pos = player.renderPosition(alpha);
  const sx = pos.x - camera.x;
  const sy = pos.y - camera.y;
  const r = player.half;

  drawShadow(ctx, sx, sy, r);
  // Flicker while invulnerable.
  if (player.iframes > 0 && Math.floor(player.iframes * 16) % 2 === 0) ctx.globalAlpha = 0.4;

  ctx.fillStyle = player.flash > 0.4 ? COLORS.flash : COLORS.player;
  ctx.strokeStyle = COLORS.playerOutline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Aim indicator: a small triangle just outside the body, pointing at the cursor.
  const a = player.aimAngle;
  const tip = r + 9;
  const base = r + 3;
  ctx.fillStyle = COLORS.aim;
  ctx.beginPath();
  ctx.moveTo(sx + Math.cos(a) * tip, sy + Math.sin(a) * tip);
  ctx.lineTo(sx + Math.cos(a + 0.45) * base, sy + Math.sin(a + 0.45) * base);
  ctx.lineTo(sx + Math.cos(a - 0.45) * base, sy + Math.sin(a - 0.45) * base);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawZombie(ctx, zombie, alpha, camera) {
  const pos = zombie.renderPosition(alpha);
  const sx = pos.x - camera.x;
  const sy = pos.y - camera.y;
  const winding = zombie.state === "windup";
  const r = zombie.half * (winding ? 1.12 : 1);

  drawShadow(ctx, sx, sy, zombie.half);

  // Arms reach toward the facing direction, further during the windup telegraph.
  const reach = winding ? r + 8 : r + 3;
  ctx.strokeStyle = COLORS.zombieOutline;
  ctx.lineWidth = 4;
  for (const side of [-0.5, 0.5]) {
    const ax = sx + Math.cos(zombie.facing + side) * (r - 2);
    const ay = sy + Math.sin(zombie.facing + side) * (r - 2);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + Math.cos(zombie.facing) * (reach - r + 4), ay + Math.sin(zombie.facing) * (reach - r + 4));
    ctx.stroke();
  }

  ctx.fillStyle = zombie.flash > 0 ? COLORS.flash : winding ? COLORS.zombieWindup : COLORS.zombie;
  ctx.strokeStyle = COLORS.zombieOutline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = COLORS.zombieEyes;
  for (const side of [-0.45, 0.45]) {
    ctx.beginPath();
    ctx.arc(sx + Math.cos(zombie.facing + side) * r * 0.55, sy + Math.sin(zombie.facing + side) * r * 0.55, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  if (zombie.hp < zombie.def.hp) {
    const width = zombie.half * 2;
    const x = sx - zombie.half;
    const y = sy - zombie.half - 8;
    ctx.fillStyle = COLORS.hpBack;
    ctx.fillRect(x, y, width, 4);
    ctx.fillStyle = COLORS.hpFill;
    ctx.fillRect(x, y, width * Math.max(0, zombie.hp / zombie.def.hp), 4);
  }
}

function drawShadow(ctx, sx, sy, r) {
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath();
  ctx.ellipse(sx, sy + r * 0.8, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawTile(ctx, tile, variant, x, y) {
  switch (tile) {
    case Tile.PATH:
      fill(ctx, pick(COLORS.path, variant), x, y);
      break;
    case Tile.VILLAGE_FLOOR:
      fill(ctx, pick(COLORS.villageFloor, variant), x, y);
      break;
    case Tile.VILLAGE_WALL:
      drawWall(ctx, x, y);
      break;
    case Tile.ROCK:
      fill(ctx, pick(COLORS.grass, variant), x, y);
      drawRock(ctx, x, y, variant);
      break;
    case Tile.TREE:
      fill(ctx, pick(COLORS.grass, variant), x, y);
      drawTree(ctx, x, y, COLORS.canopy, COLORS.canopyLight);
      break;
    case Tile.BORDER:
      fill(ctx, COLORS.border, x, y);
      drawTree(ctx, x, y, COLORS.border, COLORS.canopy);
      break;
    case Tile.DUNGEON_ENTRANCE:
      fill(ctx, pick(COLORS.grass, variant), x, y);
      drawEntrance(ctx, x, y);
      break;
    default:
      fill(ctx, pick(COLORS.grass, variant), x, y);
  }
}

function fill(ctx, color, x, y) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, T, T);
}

function pick(palette, variant) {
  return palette[variant % palette.length];
}

function drawWall(ctx, x, y) {
  fill(ctx, COLORS.wall, x, y);
  ctx.fillStyle = COLORS.wallTrim;
  ctx.fillRect(x, y + T / 2 - 1, T, 2);
  ctx.fillRect(x + T / 2 - 1, y, 2, T / 2);
  ctx.fillRect(x + T / 4 - 1, y + T / 2, 2, T / 2);
  ctx.fillRect(x + (3 * T) / 4 - 1, y + T / 2, 2, T / 2);
}

function drawRock(ctx, x, y, variant) {
  const wobble = (variant % 5) - 2;
  ctx.fillStyle = COLORS.rockShade;
  ctx.beginPath();
  ctx.ellipse(x + T / 2, y + T / 2 + 3, 12 + wobble, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.rock;
  ctx.beginPath();
  ctx.ellipse(x + T / 2, y + T / 2, 11 + wobble, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.rockLight;
  ctx.beginPath();
  ctx.ellipse(x + T / 2 - 4, y + T / 2 - 3, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawTree(ctx, x, y, canopy, highlight) {
  ctx.fillStyle = COLORS.trunk;
  ctx.fillRect(x + T / 2 - 3, y + T / 2 + 4, 6, 10);
  ctx.fillStyle = canopy;
  ctx.beginPath();
  ctx.arc(x + T / 2, y + T / 2 - 1, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = highlight;
  ctx.beginPath();
  ctx.arc(x + T / 2 - 4, y + T / 2 - 5, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawEntrance(ctx, x, y) {
  ctx.fillStyle = COLORS.entranceStone;
  ctx.fillRect(x + 2, y + 4, T - 4, T - 6);
  ctx.fillStyle = COLORS.entranceHole;
  ctx.fillRect(x + 7, y + 9, T - 14, T - 13);
  ctx.fillStyle = COLORS.entranceStone;
  for (let i = 0; i < 3; i++) ctx.fillRect(x + 9 + i * 2, y + 13 + i * 5, T - 18 - i * 4, 2);
}

function drawLabel(ctx, text, x, y) {
  ctx.fillStyle = COLORS.labelShadow;
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = COLORS.label;
  ctx.fillText(text, x, y);
}
