import { MINIMAP_SIZE, MINIMAP_TILE_PX, TILE_SIZE, VILLAGE_SIZE } from "../config.js";
import { dungeonsInRect } from "../world/dungeons.js";
import { Tile } from "../world/tiles.js";
import { VILLAGE_ORIGIN } from "../world/village.js";
import { Panel } from "./panel.js";

const T = TILE_SIZE;
const MINIMAP_REFRESH = 0.1; // s

/** Map color for each tile type, as [r, g, b]. */
export const TILE_COLORS = Object.freeze({
  [Tile.GRASS]: [79, 138, 60],
  [Tile.PATH]: [184, 154, 106],
  [Tile.ROCK]: [138, 141, 145],
  [Tile.TREE]: [38, 88, 34],
  [Tile.VILLAGE_FLOOR]: [201, 180, 138],
  [Tile.VILLAGE_WALL]: [107, 74, 47],
  [Tile.DUNGEON_ENTRANCE]: [30, 30, 36],
  [Tile.BORDER]: [24, 58, 22],
  [Tile.DUNGEON_FLOOR]: [86, 80, 72],
  [Tile.DUNGEON_WALL]: [28, 26, 24],
  [Tile.EXIT_PORTAL]: [124, 58, 237],
});
const UNEXPLORED = [9, 11, 14];

const MARKER = {
  player: "#38bdf8",
  village: "#fbbf24",
  dungeon: "#f97316",
  looted: "#6b7280",
  grave: "#f8fafc",
  portal: "#a78bfa",
  chest: "#fbbf24",
  ladder: "#fde68a",
};

/**
 * The tile window a map shows: `size` tiles square, centered on the player and clamped to
 * the area. An area smaller than the window is shown whole, centered.
 */
export function mapWindow(playerTx, playerTy, areaWidth, areaHeight, size) {
  const axis = (center, extent) => (extent <= size ? Math.floor((extent - size) / 2) : Math.min(extent - size, Math.max(0, center - Math.floor(size / 2))));
  return { x: axis(playerTx, areaWidth), y: axis(playerTy, areaHeight), size };
}

/** Paints explored tiles of the window into an ImageData at 1 px per tile; unexplored is near-black. */
function paintTiles(image, area, fog, win) {
  const { data } = image;
  for (let y = 0; y < win.size; y++) {
    for (let x = 0; x < win.size; x++) {
      const tx = win.x + x;
      const ty = win.y + y;
      const inside = tx >= 0 && ty >= 0 && tx * T < area.widthPx && ty * T < area.heightPx;
      const color = inside && fog.isExplored(tx, ty) ? TILE_COLORS[area.getTileInfo(tx, ty).tile] ?? UNEXPLORED : UNEXPLORED;
      const i = (y * win.size + x) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = 255;
    }
  }
}

/** Draws the map for `win` onto ctx at `scale` px per tile: tiles, then markers. */
function drawMap(ctx, game, win, scale, scratch) {
  const fog = game.currentFog;
  if (scratch.width !== win.size) {
    scratch.width = win.size;
    scratch.height = win.size;
  }
  const sctx = scratch.getContext("2d");
  const image = sctx.createImageData(win.size, win.size);
  paintTiles(image, game.area, fog, win);
  sctx.putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0, win.size * scale, win.size * scale);

  const at = (tx, ty) => [(tx + 0.5 - win.x) * scale, (ty + 0.5 - win.y) * scale];
  const dot = (tx, ty, color, radius) => {
    const [x, y] = at(tx, ty);
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };
  const markerRadius = Math.max(3, scale * 1.5);

  if (game.inDungeon) {
    const { portal, chest, ladder } = game.area;
    for (const [p, color] of [[portal, MARKER.portal], [chest, MARKER.chest], [ladder, MARKER.ladder]]) {
      if (fog.isExplored(p.tx, p.ty)) dot(p.tx, p.ty, color, markerRadius);
    }
  } else {
    // Village outline (always known: it's where you start).
    const [vx, vy] = at(VILLAGE_ORIGIN - 0.5, VILLAGE_ORIGIN - 0.5);
    ctx.strokeStyle = MARKER.village;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx, vy, VILLAGE_SIZE * scale, VILLAGE_SIZE * scale);
    // Dungeon entrances you've seen; greyed once looted.
    for (const d of dungeonsInRect(game.world.seed, win.x, win.y, win.x + win.size, win.y + win.size)) {
      if (!fog.isExplored(d.tx, d.ty)) continue;
      dot(d.tx, d.ty, game.dungeonStatus(d.id).cleared ? MARKER.looted : MARKER.dungeon, markerRadius);
    }
    // The grave is shown even under fog: you need to find your way back.
    if (game.grave) {
      const [gx, gy] = at(Math.floor(game.grave.x / T), Math.floor(game.grave.y / T));
      const s = markerRadius + 1;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
      ctx.lineWidth = 4;
      for (const pass of [0, 1]) {
        ctx.beginPath();
        ctx.moveTo(gx, gy - s);
        ctx.lineTo(gx, gy + s);
        ctx.moveTo(gx - s * 0.7, gy - s * 0.3);
        ctx.lineTo(gx + s * 0.7, gy - s * 0.3);
        ctx.stroke();
        if (pass === 0) {
          ctx.strokeStyle = MARKER.grave;
          ctx.lineWidth = 2;
        }
      }
    }
  }
  // The player, with a tick showing where they're aiming.
  const [px, py] = at(game.player.x / T - 0.5, game.player.y / T - 0.5);
  const a = game.player.aimAngle;
  ctx.strokeStyle = MARKER.player;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + Math.cos(a) * markerRadius * 2.2, py + Math.sin(a) * markerRadius * 2.2);
  ctx.stroke();
  ctx.fillStyle = MARKER.player;
  ctx.beginPath();
  ctx.arc(px, py, markerRadius, 0, Math.PI * 2);
  ctx.fill();
}

/** Corner minimap: an 80×80-tile window around the player, refreshed ten times a second. */
export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.scratch = document.createElement("canvas");
    this.elapsed = MINIMAP_REFRESH;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = MINIMAP_SIZE * dpr;
    canvas.height = MINIMAP_SIZE * dpr;
    canvas.style.width = `${MINIMAP_SIZE}px`;
    canvas.style.height = `${MINIMAP_SIZE}px`;
    this.ctx = canvas.getContext("2d");
    this.ctx.scale(dpr, dpr);
  }

  update(frameTime, game) {
    this.elapsed += frameTime;
    if (this.elapsed < MINIMAP_REFRESH) return;
    this.elapsed = 0;
    const tiles = MINIMAP_SIZE / MINIMAP_TILE_PX;
    const area = game.area;
    const win = mapWindow(game.player.tileX, game.player.tileY, area.widthPx / T, area.heightPx / T, tiles);
    this.ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    drawMap(this.ctx, game, win, MINIMAP_TILE_PX, this.scratch);
  }
}

/** Full-screen map (M): the whole current area, explored parts only, with a legend. */
export class MapPanel extends Panel {
  constructor(...args) {
    super(...args);
    this.wide = true;
    this.scratch = document.createElement("canvas");
  }

  onAction(action) {
    if (action === "close") {
      this.callbacks.onClose();
      return false;
    }
  }

  render() {
    const { game } = this;
    const area = game.area;
    const tiles = Math.max(area.widthPx, area.heightPx) / T;
    const px = Math.max(240, Math.min(600, window.innerWidth - 120, window.innerHeight - 220));
    const scale = px / tiles;
    const title = game.inDungeon ? `Dungeon · Lv ${area.level}` : "World map";
    const legend = game.inDungeon
      ? [["portal", "Exit portal"], ["chest", "Treasure"], ["ladder", "Ladder out"], ["player", "You"]]
      : [["village", "Village"], ["dungeon", "Dungeon"], ["looted", "Looted dungeon"], ["grave", "Your grave"], ["player", "You"]];

    this.element.innerHTML = `
      <h2>${title} <span class="dim">explored areas only</span></h2>
      <canvas class="world-map" width="${Math.round(px * (window.devicePixelRatio || 1))}" height="${Math.round(px * (window.devicePixelRatio || 1))}"
        style="width:${px}px;height:${px}px"></canvas>
      <div class="map-legend">${legend
        .map(([key, label]) => `<span><i style="background:${MARKER[key]}"></i>${label}</span>`)
        .join("")}</div>
      <div class="actions"><button class="btn" data-action="close">Close (M)</button></div>`;

    const canvas = this.element.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    drawMap(ctx, game, { x: 0, y: 0, size: tiles }, scale, this.scratch);
  }
}
