import { CHUNK_SIZE, TILE_SIZE } from "./config.js";
import { STRUCTURES } from "./data/structures.js";
import { WEAPONS } from "./data/weapons.js";
import { hasTool } from "./systems/gathering.js";
import { Tile } from "./world/tiles.js";
import { VILLAGE_CENTER_TILE, VILLAGE_NPCS, VILLAGE_ORIGIN } from "./world/village.js";

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
  entranceStone: "#5b5b63",
  entranceHole: "#141418",
  player: "#3b82f6",
  playerOutline: "#1e3a8a",
  aim: "#f8fafc",
  label: "#f8fafc",
  labelShadow: "rgba(0, 0, 0, 0.75)",
  shadow: "rgba(0, 0, 0, 0.25)",
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
  npcOutline: "#2e1065",
  prompt: "#fbbf24",
  chestTrim: "#3f2a14",
  chestLock: "#fde047",
  chestInside: "#1c1208",
  treasure: "#b45309",
  labelDim: "#9ca3af",
  lootedOverlay: "rgba(17, 24, 39, 0.55)",
  dungeonFloor: ["#3a3631", "#36322d", "#3e3a34"],
  dungeonCrack: "#2a2723",
  dungeonWall: "#1f1d1b",
  dungeonWallTop: "#4a4540",
  dungeonMortar: "#151413",
  portalOuter: "#4c1d95",
  portalMid: "#7c3aed",
  portalCore: "#ddd6fe",
  tombstone: "#9ca3af",
  tombstoneEdge: "#4b5563",
  dirt: "#5b4636",
  graveArrow: "#e5e7eb",
  rope: "#d6b37a",
  ropeKnot: "#8b6b3e",
  daylight: "rgba(254, 243, 199, 0.45)",
  stairs: "#6b6560",
  stairsDark: "#2a2622",
  bossCrown: "#facc15",
  tableWood: "#7c4a21",
  tableTop: "#a16207",
  runeGlow: "#a78bfa",
  cauldron: "#334155",
  brew: "#22c55e",
  harvestRing: "#fde68a",
  placeOk: "rgba(74, 222, 128, 0.45)",
  placeBad: "rgba(248, 113, 113, 0.45)",
};

/** Draws every tile intersecting the camera view. */
/** Draws every tile of the current area (overworld or dungeon) intersecting the camera view. */
export function drawWorld(ctx, area, camera) {
  const startX = Math.floor(camera.x / T);
  const startY = Math.floor(camera.y / T);
  const endX = Math.floor((camera.x + camera.width) / T);
  const endY = Math.floor((camera.y + camera.height) / T);

  for (let ty = startY; ty <= endY; ty++) {
    for (let tx = startX; tx <= endX; tx++) {
      const { tile, variant } = area.getTileInfo(tx, ty);
      drawTile(ctx, tile, variant, tx * T - camera.x, ty * T - camera.y);
    }
  }
}

/**
 * Overworld labels: "Dungeon · Lv N" over entrances near the view (greyed with "Looted"
 * once cleared), plus the village name. Nothing in dungeons.
 */
export function drawLabels(ctx, game, camera) {
  if (game.inDungeon) return;
  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  const firstChunkX = Math.floor(camera.x / T / CHUNK_SIZE);
  const firstChunkY = Math.floor(camera.y / T / CHUNK_SIZE);
  const lastChunkX = Math.floor((camera.x + camera.width) / T / CHUNK_SIZE);
  const lastChunkY = Math.floor((camera.y + camera.height) / T / CHUNK_SIZE);
  for (let cy = firstChunkY; cy <= lastChunkY; cy++) {
    for (let cx = firstChunkX; cx <= lastChunkX; cx++) {
      for (const d of game.world.getChunk(cx, cy).dungeons) {
        const x = d.tx * T - camera.x;
        const y = d.ty * T - camera.y;
        const cleared = game.dungeonStatus(d.id).cleared;
        if (cleared) {
          ctx.fillStyle = COLORS.lootedOverlay;
          ctx.fillRect(x, y, T, T);
        }
        drawLabel(ctx, `Dungeon · Lv ${d.level}${cleared ? " · Looted" : ""}`, x + T / 2, y - 4, cleared ? COLORS.labelDim : COLORS.label);
      }
    }
  }
  drawLabel(ctx, "Village (safe zone)", VILLAGE_CENTER_TILE * T - camera.x, VILLAGE_ORIGIN * T - camera.y - 6);
}

/** Draws the player, enemies, NPCs, structures and chests, sorted by y so lower sprites overlap higher ones. */
export function drawEntities(ctx, game, alpha, camera) {
  const drawables = [
    { y: game.player.y, draw: () => drawPlayer(ctx, game.player, alpha, camera) },
    ...game.enemies.map((e) => ({ y: e.y, draw: () => drawEnemy(ctx, e, alpha, camera) })),
  ];
  if (game.inDungeon) {
    const { chest, rope } = game.area;
    if (rope) drawRope(ctx, rope.tx * T - camera.x, rope.ty * T - camera.y);
    if (chest) {
      const opened = game.dungeonStatus(game.area.id).chest !== null;
      drawables.push({
        y: (chest.ty + 0.5) * T,
        draw: () => drawChest(ctx, (chest.tx + 0.5) * T - camera.x, (chest.ty + 0.5) * T - camera.y, COLORS.treasure, opened),
      });
    }
  } else {
    drawables.push(...VILLAGE_NPCS.map((npc) => ({ y: (npc.ty + 0.5) * T, draw: () => drawNpc(ctx, npc, camera) })));
    for (const s of game.structures) {
      drawables.push({ y: (s.ty + 0.5) * T, draw: () => drawStructure(ctx, s.kind, s.tx * T - camera.x, s.ty * T - camera.y, s.level) });
    }
    if (game.grave) {
      const { x, y } = game.grave;
      drawables.push({ y, draw: () => drawGrave(ctx, x - camera.x, y - camera.y) });
    }
  }
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

function drawEnemy(ctx, enemy, alpha, camera) {
  const pos = enemy.renderPosition(alpha);
  const sx = pos.x - camera.x;
  const sy = pos.y - camera.y;
  const { def } = enemy;
  if (def.movement === "hop") drawSlime(ctx, enemy, sx, sy);
  else drawWalker(ctx, enemy, sx, sy);

  const barWidth = def.boss ? 64 : enemy.half * 2;
  const barY = sy - enemy.half - 10;
  if (def.boss) {
    drawCrown(ctx, sx, barY - 6);
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    drawLabel(ctx, `${def.name} · Lv ${def.level}`, sx, barY - 14, COLORS.bossCrown);
  }
  if (enemy.hp < def.hp || def.boss) {
    ctx.fillStyle = COLORS.hpBack;
    ctx.fillRect(sx - barWidth / 2, barY, barWidth, 4);
    ctx.fillStyle = COLORS.hpFill;
    ctx.fillRect(sx - barWidth / 2, barY, barWidth * Math.max(0, enemy.hp / def.hp), 4);
  }
}

function drawCrown(ctx, x, y) {
  ctx.fillStyle = COLORS.bossCrown;
  ctx.beginPath();
  ctx.moveTo(x - 9, y + 4);
  ctx.lineTo(x - 9, y - 4);
  ctx.lineTo(x - 4, y);
  ctx.lineTo(x, y - 7);
  ctx.lineTo(x + 4, y);
  ctx.lineTo(x + 9, y - 4);
  ctx.lineTo(x + 9, y + 4);
  ctx.closePath();
  ctx.fill();
}

// Zombies and walking bosses: a round body with arms that reach out during the windup.
function drawWalker(ctx, enemy, sx, sy) {
  const winding = enemy.state === "windup";
  const r = enemy.half * (winding ? 1.12 : 1);
  const outline = shade(enemy.def.color);
  drawShadow(ctx, sx, sy, enemy.half);

  const reach = winding ? r + 8 : r + 3;
  ctx.strokeStyle = outline;
  ctx.lineWidth = enemy.def.boss ? 6 : 4;
  for (const side of [-0.5, 0.5]) {
    const ax = sx + Math.cos(enemy.facing + side) * (r - 2);
    const ay = sy + Math.sin(enemy.facing + side) * (r - 2);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + Math.cos(enemy.facing) * (reach - r + 4), ay + Math.sin(enemy.facing) * (reach - r + 4));
    ctx.stroke();
  }

  ctx.fillStyle = enemy.flash > 0 ? COLORS.flash : winding ? COLORS.zombieWindup : enemy.def.color;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = COLORS.zombieEyes;
  for (const side of [-0.45, 0.45]) {
    ctx.beginPath();
    ctx.arc(sx + Math.cos(enemy.facing + side) * r * 0.55, sy + Math.sin(enemy.facing + side) * r * 0.55, enemy.def.boss ? 3 : 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Slimes: a squashy blob that lifts off the ground mid-hop and turns red while winding up.
function drawSlime(ctx, enemy, sx, sy) {
  const winding = enemy.state === "windup";
  const lift = enemy.hopLift * enemy.half * 0.9;
  const squash = enemy.airborne ? 0.92 : 1.12;
  const r = enemy.half * (winding ? 1.12 : 1);
  drawShadow(ctx, sx, sy, enemy.half * (1 - enemy.hopLift * 0.3));
  ctx.fillStyle = enemy.flash > 0 ? COLORS.flash : winding ? COLORS.zombieWindup : enemy.def.color;
  ctx.strokeStyle = shade(enemy.def.color);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(sx, sy - lift + r * 0.15, r * squash, (r / squash) * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.beginPath();
  ctx.ellipse(sx - r * 0.35, sy - lift - r * 0.2, r * 0.25, r * 0.15, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111827";
  for (const side of [-0.4, 0.4]) {
    ctx.beginPath();
    ctx.arc(sx + Math.cos(enemy.facing + side) * r * 0.45, sy - lift + Math.sin(enemy.facing + side) * r * 0.3, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// A darker outline for any body color ("#rrggbb").
function shade(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  const dim = (c) => Math.floor(c * 0.45);
  return `rgb(${dim(n >> 16)}, ${dim((n >> 8) & 255)}, ${dim(n & 255)})`;
}

/**
 * Names over NPCs, structures, and dungeon fixtures, plus an "[F] …" prompt over the one in
 * interact range. With nothing in range: a "[Hold F]" prompt over a tree or rock within reach,
 * and a progress ring while it's being harvested.
 */
export function drawInteractions(ctx, game, camera) {
  const nearby = game.nearbyInteractable();
  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (const it of game.interactables()) {
    const x = (it.tx + (it.w ?? 1) / 2) * T - camera.x;
    const y = it.ty * T - camera.y - (it.kind === "entrance" ? 18 : 2);
    if (it.kind !== "entrance") drawLabel(ctx, it.name, x, y);
    if (nearby && it.kind === nearby.kind && it.tx === nearby.tx && it.ty === nearby.ty) {
      ctx.fillStyle = COLORS.prompt;
      ctx.fillText(it.prompt, x, y - 14);
    }
  }
  if (nearby) return;
  const target = game.nearbyNode();
  if (!target) return;
  const x = (target.tx + 0.5) * T - camera.x;
  const y = (target.ty + 0.5) * T - camera.y;
  const h = game.harvesting;
  if (h && h.tx === target.tx && h.ty === target.ty) {
    ctx.strokeStyle = COLORS.labelShadow;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = COLORS.harvestRing;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * h.progress);
    ctx.stroke();
    return;
  }
  const { tool } = target.node;
  const ready = hasTool(game.player.inventory, tool);
  ctx.fillStyle = ready ? COLORS.prompt : COLORS.labelDim;
  const text = ready ? `[Hold F] ${tool === "axe" ? "Chop tree" : "Mine rock"}` : `Needs ${tool === "axe" ? "an axe" : "a pickaxe"}`;
  ctx.fillText(text, x, y - T / 2 - 4);
}

/** Ghost of a structure being placed at `tile`: green where it fits, red where it doesn't. */
export function drawPlacement(ctx, game, placing, tile, camera) {
  if (!placing || !tile) return;
  const { w, h } = STRUCTURES[placing.kind];
  const existing = game.structure(placing.kind);
  const ok = game.canPlace(placing.kind, tile.tx, tile.ty, existing);
  ctx.fillStyle = ok ? COLORS.placeOk : COLORS.placeBad;
  ctx.fillRect(tile.tx * T - camera.x, tile.ty * T - camera.y, w * T, h * T);
  ctx.globalAlpha = 0.7;
  drawStructure(ctx, placing.kind, tile.tx * T - camera.x, tile.ty * T - camera.y, existing?.level ?? 1);
  ctx.globalAlpha = 1;
  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  const text = ok ? "Click to place · Esc to cancel" : "Doesn't fit here · Esc to cancel";
  drawLabel(ctx, text, (tile.tx + w / 2) * T - camera.x, tile.ty * T - camera.y - 4, ok ? COLORS.label : COLORS.zombieWindup);
}

/** Arrow at the screen edge pointing to an off-screen grave, with its distance in tiles. */
export function drawGraveArrow(ctx, game, alpha, camera) {
  if (!game.grave || game.inDungeon) return;
  const gx = game.grave.x - camera.x;
  const gy = game.grave.y - camera.y;
  const margin = 40;
  if (gx >= 0 && gy >= 0 && gx <= camera.width && gy <= camera.height) return;

  const pos = game.player.renderPosition(alpha);
  const px = pos.x - camera.x;
  const py = pos.y - camera.y;
  const angle = Math.atan2(gy - py, gx - px);
  // Walk from the player toward the grave until hitting the inset screen edge.
  const scale = Math.min(
    Math.abs((Math.cos(angle) > 0 ? camera.width - margin - px : margin - px) / (Math.cos(angle) || 1e-9)),
    Math.abs((Math.sin(angle) > 0 ? camera.height - margin - py : margin - py) / (Math.sin(angle) || 1e-9)),
  );
  const ax = px + Math.cos(angle) * scale;
  const ay = py + Math.sin(angle) * scale;

  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(angle);
  ctx.fillStyle = COLORS.graveArrow;
  ctx.strokeStyle = COLORS.labelShadow;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-8, -9);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-8, 9);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();

  const tiles = Math.round(Math.hypot(game.grave.x - game.player.x, game.grave.y - game.player.y) / T);
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  drawLabel(ctx, `Grave · ${tiles}`, ax, ay + 12, COLORS.graveArrow);
}

/**
 * Dev overlay: collision boxes for the player and enemies, enemy aggro (yellow) and attack
 * (red) radii, the sword's reach, and projectile radii.
 */
export function drawHitboxes(ctx, game, alpha, camera) {
  if (!game.showHitboxes) return;
  const circle = (x, y, r, color) => {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(x - camera.x, y - camera.y, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  const box = (x, y, half, color) => {
    ctx.strokeStyle = color;
    ctx.strokeRect(x - half - camera.x, y - half - camera.y, half * 2, half * 2);
  };
  ctx.lineWidth = 1;
  const p = game.player.renderPosition(alpha);
  box(p.x, p.y, game.player.half, "#38bdf8");
  circle(p.x, p.y, WEAPONS.sword.range * T, "rgba(56, 189, 248, 0.5)");
  for (const z of game.enemies) {
    const pos = z.renderPosition(alpha);
    box(pos.x, pos.y, z.half, "#4ade80");
    circle(pos.x, pos.y, z.def.aggroRadius * T, "rgba(250, 204, 21, 0.35)");
    circle(pos.x, pos.y, z.def.attackRange * T, "rgba(239, 68, 68, 0.6)");
  }
  for (const pr of game.projectiles) circle(pr.x, pr.y, pr.radius, "#f472b6");
}

/** Torchlight: darkens a dungeon except for a soft circle around the player. */
export function drawDarkness(ctx, game, alpha, camera) {
  if (!game.inDungeon) return;
  const pos = game.player.renderPosition(alpha);
  const sx = pos.x - camera.x;
  const sy = pos.y - camera.y;
  const gradient = ctx.createRadialGradient(sx, sy, 3 * T, sx, sy, 11 * T);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.82)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, camera.width, camera.height);
}

function drawNpc(ctx, npc, camera) {
  const sx = (npc.tx + 0.5) * T - camera.x;
  const sy = (npc.ty + 0.5) * T - camera.y;
  if (npc.kind === "stash") {
    drawChest(ctx, sx, sy, npc.color, false);
    return;
  }
  const r = 11;
  drawShadow(ctx, sx, sy, r);
  ctx.fillStyle = npc.color;
  ctx.strokeStyle = COLORS.npcOutline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Pointed hat.
  ctx.fillStyle = COLORS.npcOutline;
  ctx.beginPath();
  ctx.moveTo(sx - 9, sy - 5);
  ctx.lineTo(sx + 9, sy - 5);
  ctx.lineTo(sx + 2, sy - 20);
  ctx.closePath();
  ctx.fill();
}

/** An escape rope hanging in a shaft of daylight, filling the tile whose top-left is (x, y). */
function drawRope(ctx, x, y) {
  const light = ctx.createRadialGradient(x + T / 2, y + T / 2, 2, x + T / 2, y + T / 2, T);
  light.addColorStop(0, COLORS.daylight);
  light.addColorStop(1, "rgba(254, 243, 199, 0)");
  ctx.fillStyle = light;
  ctx.fillRect(x - T / 2, y - T / 2, T * 2, T * 2);

  ctx.strokeStyle = COLORS.rope;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + T / 2, y - 10);
  ctx.bezierCurveTo(x + T / 2 + 4, y + 6, x + T / 2 - 4, y + 14, x + T / 2, y + T - 4);
  ctx.stroke();
  ctx.fillStyle = COLORS.ropeKnot;
  for (const ky of [4, 14, 24]) ctx.fillRect(x + T / 2 - 3, y + ky, 6, 3);
}

/** A placed village structure with its top-left at (x, y). The enchanting table shows a rune stone per level. */
function drawStructure(ctx, kind, x, y, level) {
  const { w } = STRUCTURES[kind];
  drawShadow(ctx, x + (w * T) / 2, y + T / 2 + 2, (w * T) / 2 - 2);
  if (kind === "enchantingTable") {
    ctx.fillStyle = COLORS.tableWood;
    ctx.fillRect(x + 4, y + 18, 5, 12);
    ctx.fillRect(x + w * T - 9, y + 18, 5, 12);
    ctx.fillStyle = COLORS.tableTop;
    ctx.fillRect(x + 2, y + 8, w * T - 4, 12);
    ctx.strokeStyle = COLORS.chestTrim;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 8, w * T - 4, 12);
    ctx.fillStyle = COLORS.runeGlow;
    for (let i = 0; i < Math.min(4, level); i++) {
      ctx.beginPath();
      ctx.arc(x + 14 + i * 12, y + 14, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  ctx.fillStyle = COLORS.cauldron;
  ctx.beginPath();
  ctx.ellipse(x + T / 2, y + T / 2 + 4, 12, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.brew;
  ctx.beginPath();
  ctx.ellipse(x + T / 2, y + T / 2 - 2, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(187, 247, 208, 0.8)";
  ctx.beginPath();
  ctx.arc(x + T / 2 - 3, y + T / 2 - 8, 2.5, 0, Math.PI * 2);
  ctx.arc(x + T / 2 + 4, y + T / 2 - 12, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawGrave(ctx, sx, sy) {
  drawShadow(ctx, sx, sy + 4, 11);
  ctx.fillStyle = COLORS.dirt;
  ctx.beginPath();
  ctx.ellipse(sx, sy + 8, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.tombstone;
  ctx.strokeStyle = COLORS.tombstoneEdge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx - 9, sy + 8);
  ctx.lineTo(sx - 9, sy - 6);
  ctx.arc(sx, sy - 6, 9, Math.PI, 0);
  ctx.lineTo(sx + 9, sy + 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.tombstoneEdge;
  ctx.fillRect(sx - 1, sy - 9, 2, 11);
  ctx.fillRect(sx - 4, sy - 6, 8, 2);
}

/** A wooden chest centered on (sx, sy); `open` draws the lid raised. */
function drawChest(ctx, sx, sy, color, open) {
  drawShadow(ctx, sx, sy + 2, 12);
  ctx.fillStyle = color;
  ctx.strokeStyle = COLORS.chestTrim;
  ctx.lineWidth = 2;
  ctx.fillRect(sx - 12, sy - 6, 24, 14);
  ctx.strokeRect(sx - 12, sy - 6, 24, 14);
  if (open) {
    ctx.fillStyle = COLORS.chestInside;
    ctx.fillRect(sx - 11, sy - 5, 22, 4);
    ctx.fillStyle = color;
    ctx.fillRect(sx - 12, sy - 16, 24, 7);
    ctx.strokeRect(sx - 12, sy - 16, 24, 7);
  } else {
    ctx.fillRect(sx - 12, sy - 12, 24, 7);
    ctx.strokeRect(sx - 12, sy - 12, 24, 7);
    ctx.fillStyle = COLORS.chestLock;
    ctx.fillRect(sx - 2, sy - 7, 4, 5);
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
    case Tile.DUNGEON_ENTRANCE:
      fill(ctx, pick(COLORS.grass, variant), x, y);
      drawEntrance(ctx, x, y);
      break;
    case Tile.DUNGEON_FLOOR:
      fill(ctx, pick(COLORS.dungeonFloor, variant), x, y);
      if (variant % 7 === 0) {
        ctx.fillStyle = COLORS.dungeonCrack;
        ctx.fillRect(x + (variant % 20) + 4, y + ((variant >> 3) % 20) + 4, 6, 2);
      }
      break;
    case Tile.DUNGEON_WALL:
      fill(ctx, COLORS.dungeonWall, x, y);
      ctx.fillStyle = COLORS.dungeonWallTop;
      ctx.fillRect(x, y, T, 5);
      ctx.fillStyle = COLORS.dungeonMortar;
      ctx.fillRect(x, y + 17, T, 2);
      ctx.fillRect(x + ((variant & 1) ? 10 : 20), y + 5, 2, 12);
      break;
    case Tile.EXIT_PORTAL:
      fill(ctx, pick(COLORS.dungeonFloor, variant), x, y);
      drawPortal(ctx, x, y);
      break;
    case Tile.STAIRS_DOWN:
    case Tile.STAIRS_UP:
      fill(ctx, pick(COLORS.dungeonFloor, variant), x, y);
      drawStairs(ctx, x, y, tile === Tile.STAIRS_DOWN);
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

// Steps going down (darkening into the hole) or up (lighter toward the top).
function drawStairs(ctx, x, y, down) {
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = down ? `rgba(20, 18, 16, ${0.25 + i * 0.2})` : `rgba(150, 140, 130, ${0.9 - i * 0.18})`;
    ctx.fillRect(x + 3 + i * 2, y + 4 + i * 6, T - 6 - i * 4, 6);
  }
  ctx.strokeStyle = COLORS.stairsDark;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 3, y + 4, T - 6, T - 8);
}

function drawPortal(ctx, x, y) {
  const cx = x + T / 2;
  const cy = y + T / 2;
  for (const [r, color] of [[14, COLORS.portalOuter], [10, COLORS.portalMid], [5, COLORS.portalCore]]) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLabel(ctx, text, x, y, color = COLORS.label) {
  ctx.fillStyle = COLORS.labelShadow;
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
