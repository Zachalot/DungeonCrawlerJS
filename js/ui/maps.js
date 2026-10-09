import { MAP_MAX_TILE_PX, MAP_OPEN_TILE_PX, MINIMAP_SIZE, MINIMAP_TILE_PX, TILE_SIZE, VILLAGE_SIZE } from "../config.js";
import { dungeonsInRect } from "../world/dungeons.js";
import { Tile } from "../world/tiles.js";
import { VILLAGE_CENTER_TILE, VILLAGE_ORIGIN } from "../world/village.js";
import { Panel } from "./panel.js";

const T = TILE_SIZE;
const MINIMAP_REFRESH = 0.1; // s
const LABEL_MIN_SCALE = 3; // px per tile before map labels appear
const ZOOM_STEP = 1.25;

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

export const MARKER_COLORS = Object.freeze({
  player: "#38bdf8",
  village: "#fbbf24",
  dungeon: "#f97316",
  looted: "#9ca3af",
  grave: "#f8fafc",
  portal: "#a78bfa",
  chest: "#fbbf24",
  ladder: "#fde68a",
});

// ---- View math (pure, tested) ----------------------------------------------
// A view is { x, y, scale, width, height }: the tile coordinate at the canvas's top-left,
// pixels per tile, and the canvas size in CSS px.

/** Pixels per tile that fits the whole area in the view. */
export function fitScale(width, height, areaTiles) {
  return Math.min(width / areaTiles.w, height / areaTiles.h);
}

/** A view of `width × height` px at `scale`, centered on tile (cx, cy). */
export function centeredView(cx, cy, scale, width, height) {
  return { x: cx - width / scale / 2, y: cy - height / scale / 2, scale, width, height };
}

/** Keeps the view's center inside the area, so you can't pan off into the void. */
export function clampView(view, areaTiles) {
  const halfW = view.width / view.scale / 2;
  const halfH = view.height / view.scale / 2;
  const cx = Math.min(areaTiles.w, Math.max(0, view.x + halfW));
  const cy = Math.min(areaTiles.h, Math.max(0, view.y + halfH));
  return { ...view, x: cx - halfW, y: cy - halfH };
}

/** Zooms by `factor` around canvas point (px, py): the tile under the cursor stays put. */
export function zoomAt(view, factor, px, py, minScale, maxScale) {
  const scale = Math.min(maxScale, Math.max(minScale, view.scale * factor));
  const tx = view.x + px / view.scale;
  const ty = view.y + py / view.scale;
  return { ...view, scale, x: tx - px / scale, y: ty - py / scale };
}

// ---- Painting ---------------------------------------------------------------

/** Paints tiles [x0, x0 + w) × [y0, y0 + h) into `canvas` at 1 px per tile; unexplored is near-black. */
function paintTiles(canvas, area, fog, x0, y0, w, h) {
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(w, h);
  const { data } = image;
  const areaW = area.widthPx / T;
  const areaH = area.heightPx / T;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tx = x0 + x;
      const ty = y0 + y;
      const inside = tx >= 0 && ty >= 0 && tx < areaW && ty < areaH;
      const color = inside && fog.isExplored(tx, ty) ? TILE_COLORS[area.getTileInfo(tx, ty).tile] ?? UNEXPLORED : UNEXPLORED;
      const i = (y * w + x) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return { canvas, x0, y0 };
}

/**
 * Draws a painted tile image and the markers for `view`. Markers have fixed pixel sizes
 * so they stay readable at any zoom; labels appear once zoomed in far enough.
 */
function drawMapView(ctx, game, view, painted, { labels }) {
  ctx.fillStyle = `rgb(${UNEXPLORED.join(",")})`;
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    painted.canvas,
    (painted.x0 - view.x) * view.scale,
    (painted.y0 - view.y) * view.scale,
    painted.canvas.width * view.scale,
    painted.canvas.height * view.scale,
  );

  const at = (tx, ty) => [(tx - view.x) * view.scale, (ty - view.y) * view.scale];
  const showLabels = labels && view.scale >= LABEL_MIN_SCALE;
  const fog = game.currentFog;

  if (game.inDungeon) {
    const { portal, chest, ladder } = game.area;
    if (fog.isExplored(portal.tx, portal.ty)) drawPortalIcon(ctx, ...at(portal.tx + 0.5, portal.ty + 0.5), showLabels);
    if (fog.isExplored(chest.tx, chest.ty)) drawChestIcon(ctx, ...at(chest.tx + 0.5, chest.ty + 0.5), showLabels);
    if (fog.isExplored(ladder.tx, ladder.ty)) drawLadderIcon(ctx, ...at(ladder.tx + 0.5, ladder.ty + 0.5), showLabels);
  } else {
    drawVillage(ctx, at, view.scale, labels);
    const tiles = { x0: Math.floor(view.x), y0: Math.floor(view.y), x1: Math.ceil(view.x + view.width / view.scale), y1: Math.ceil(view.y + view.height / view.scale) };
    for (const d of dungeonsInRect(game.world.seed, tiles.x0, tiles.y0, tiles.x1, tiles.y1)) {
      if (!fog.isExplored(d.tx, d.ty)) continue;
      const looted = game.dungeonStatus(d.id).cleared;
      drawDungeonIcon(ctx, ...at(d.tx + 0.5, d.ty + 0.5), looted, showLabels ? (looted ? `Lv ${d.level} · Looted` : `Lv ${d.level}`) : null);
    }
    // The grave is shown even under fog: you need to find your way back.
    if (game.grave) drawGraveIcon(ctx, ...at(game.grave.x / T, game.grave.y / T), showLabels);
  }
  drawPlayerIcon(ctx, ...at(game.player.x / T, game.player.y / T), game.player.aimAngle);
}

// ---- Markers (fixed pixel sizes) -------------------------------------------------

function outlined(ctx, draw, fill, stroke = "rgba(0, 0, 0, 0.85)", width = 2) {
  ctx.beginPath();
  draw();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

function label(ctx, text, x, y, color = "#f8fafc") {
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// The village is always known: a filled gold area (at least 14 px so it's never lost) and a label.
function drawVillage(ctx, at, scale, labels) {
  const size = Math.max(14, VILLAGE_SIZE * scale);
  const [cx, cy] = at(VILLAGE_CENTER_TILE, VILLAGE_CENTER_TILE);
  ctx.fillStyle = "rgba(251, 191, 36, 0.35)";
  ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
  ctx.strokeStyle = MARKER_COLORS.village;
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - size / 2, cy - size / 2, size, size);
  if (labels) label(ctx, "Village", cx, cy + size / 2 + 3, MARKER_COLORS.village);
}

// A square stairs icon: orange while unlooted, grey with a check mark once looted.
function drawDungeonIcon(ctx, x, y, looted, text) {
  const s = 7;
  outlined(ctx, () => ctx.rect(x - s, y - s, s * 2, s * 2), looted ? "#374151" : "#1c1917", looted ? MARKER_COLORS.looted : MARKER_COLORS.dungeon, 2.5);
  ctx.strokeStyle = looted ? MARKER_COLORS.looted : MARKER_COLORS.dungeon;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (looted) {
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x - 1, y + 3);
    ctx.lineTo(x + 4, y - 3);
  } else {
    ctx.moveTo(x - 4, y + 4);
    ctx.lineTo(x - 4, y + 1);
    ctx.lineTo(x - 1, y + 1);
    ctx.lineTo(x - 1, y - 2);
    ctx.lineTo(x + 2, y - 2);
    ctx.lineTo(x + 2, y - 5);
  }
  ctx.stroke();
  if (text) label(ctx, text, x, y + s + 3, looted ? MARKER_COLORS.looted : MARKER_COLORS.dungeon);
}

function drawGraveIcon(ctx, x, y, showLabel) {
  ctx.lineCap = "round";
  for (const [color, width] of [["rgba(0, 0, 0, 0.9)", 6], [MARKER_COLORS.grave, 2.5]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x, y + 7);
    ctx.moveTo(x - 5, y - 2);
    ctx.lineTo(x + 5, y - 2);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  if (showLabel) label(ctx, "Your grave", x, y + 9);
}

function drawPortalIcon(ctx, x, y, showLabel) {
  outlined(ctx, () => ctx.arc(x, y, 6, 0, Math.PI * 2), MARKER_COLORS.portal);
  if (showLabel) label(ctx, "Exit", x, y + 9, MARKER_COLORS.portal);
}

function drawChestIcon(ctx, x, y, showLabel) {
  outlined(ctx, () => ctx.rect(x - 6, y - 5, 12, 10), MARKER_COLORS.chest);
  if (showLabel) label(ctx, "Treasure", x, y + 8, MARKER_COLORS.chest);
}

function drawLadderIcon(ctx, x, y, showLabel) {
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.lineWidth = 5;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 7);
    ctx.lineTo(x - 4, y + 7);
    ctx.moveTo(x + 4, y - 7);
    ctx.lineTo(x + 4, y + 7);
    for (const ry of [-3, 1, 5]) {
      ctx.moveTo(x - 4, y + ry);
      ctx.lineTo(x + 4, y + ry);
    }
  };
  path();
  ctx.stroke();
  ctx.strokeStyle = MARKER_COLORS.ladder;
  ctx.lineWidth = 2;
  path();
  ctx.stroke();
  if (showLabel) label(ctx, "Ladder", x, y + 9, MARKER_COLORS.ladder);
}

// An arrow pointing where the player aims.
function drawPlayerIcon(ctx, x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  outlined(
    ctx,
    () => {
      ctx.moveTo(9, 0);
      ctx.lineTo(-6, -6);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-6, 6);
      ctx.closePath();
    },
    MARKER_COLORS.player,
  );
  ctx.restore();
}

// ---- Minimap -----------------------------------------------------------------

/** Corner minimap: a 40 × 40-tile window around the player, refreshed ten times a second. */
export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.scratch = document.createElement("canvas");
    this.elapsed = MINIMAP_REFRESH;
    this.ctx = canvas.getContext("2d");
    this.dpr = null;
    canvas.style.width = `${MINIMAP_SIZE}px`;
    canvas.style.height = `${MINIMAP_SIZE}px`;
  }

  // Re-sizes the backing store if the display scale changed (browser zoom, another monitor).
  fitToDisplay() {
    const dpr = window.devicePixelRatio || 1;
    if (dpr === this.dpr) return;
    this.dpr = dpr;
    this.canvas.width = Math.round(MINIMAP_SIZE * dpr);
    this.canvas.height = Math.round(MINIMAP_SIZE * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  update(frameTime, game) {
    this.elapsed += frameTime;
    if (this.elapsed < MINIMAP_REFRESH) return;
    this.elapsed = 0;
    this.fitToDisplay();
    const view = centeredView(game.player.x / T, game.player.y / T, MINIMAP_TILE_PX, MINIMAP_SIZE, MINIMAP_SIZE);
    const x0 = Math.floor(view.x);
    const y0 = Math.floor(view.y);
    const tiles = Math.ceil(MINIMAP_SIZE / MINIMAP_TILE_PX) + 2;
    const painted = paintTiles(this.scratch, game.area, game.currentFog, x0, y0, tiles, tiles);
    drawMapView(this.ctx, game, view, painted, { labels: false });
  }
}

// ---- Full-screen map (M) ------------------------------------------------------

/**
 * Full-screen map: opens zoomed in on the player. Scroll to zoom around the cursor, drag to
 * pan, or use the buttons. The tiles are painted once on open (the game is paused), so
 * panning and zooming only redraw.
 */
export class MapPanel extends Panel {
  constructor(...args) {
    super(...args);
    this.wide = true;
    this.scratch = document.createElement("canvas");
    this.painted = null;
    this.view = null;
    this.drag = null;
  }

  areaTiles() {
    const { area } = this.game;
    return { w: area.widthPx / T, h: area.heightPx / T };
  }

  onOpen() {
    const { game } = this;
    const area = this.areaTiles();
    this.painted = paintTiles(this.scratch, game.area, game.currentFog, 0, 0, area.w, area.h);
    this.view = null; // sized in render(), once the canvas size is known
  }

  canvasSize() {
    return {
      width: Math.max(320, Math.min(900, window.innerWidth - 80)),
      height: Math.max(240, Math.min(620, window.innerHeight - 230)),
    };
  }

  zoomLimits() {
    const fit = fitScale(this.view.width, this.view.height, this.areaTiles());
    return { min: Math.min(fit, MAP_MAX_TILE_PX), max: MAP_MAX_TILE_PX };
  }

  setView(view) {
    this.view = clampView(view, this.areaTiles());
    this.draw();
  }

  centerOnPlayer(scale = this.view.scale) {
    const { player } = this.game;
    this.setView(centeredView(player.x / T, player.y / T, scale, this.view.width, this.view.height));
  }

  showWhole() {
    const area = this.areaTiles();
    this.setView(centeredView(area.w / 2, area.h / 2, this.zoomLimits().min, this.view.width, this.view.height));
  }

  zoom(factor, px = this.view.width / 2, py = this.view.height / 2) {
    const { min, max } = this.zoomLimits();
    this.setView(zoomAt(this.view, factor, px, py, min, max));
  }

  onAction(action) {
    if (action === "close") {
      this.callbacks.onClose();
    } else if (action === "zoomIn") {
      this.zoom(ZOOM_STEP);
    } else if (action === "zoomOut") {
      this.zoom(1 / ZOOM_STEP);
    } else if (action === "center") {
      this.centerOnPlayer();
    } else if (action === "whole") {
      this.showWhole();
    }
    return false; // the canvas redraws itself; rebuilding the DOM would drop the view
  }

  render() {
    const { game } = this;
    const { width, height } = this.canvasSize();
    const dpr = window.devicePixelRatio || 1;
    const title = game.inDungeon ? `Dungeon · Lv ${game.area.level}` : "World map";
    const legend = game.inDungeon
      ? [["portal", "Exit portal", "round"], ["chest", "Treasure", ""], ["ladder", "Ladder out", ""], ["player", "You", "arrow"]]
      : [["village", "Village", ""], ["dungeon", "Dungeon", ""], ["looted", "Looted dungeon", ""], ["grave", "Your grave", "cross"], ["player", "You", "arrow"]];

    this.element.innerHTML = `
      <h2>${title} <span class="dim">explored areas only</span></h2>
      <canvas class="world-map" width="${Math.round(width * dpr)}" height="${Math.round(height * dpr)}" style="width:${width}px;height:${height}px"></canvas>
      <div class="map-toolbar">
        <button class="btn small" data-action="zoomOut" aria-label="Zoom out">−</button>
        <button class="btn small" data-action="zoomIn" aria-label="Zoom in">+</button>
        <button class="btn small" data-action="center">Center on me</button>
        <button class="btn small" data-action="whole">Whole map</button>
        <span class="dim small">Scroll to zoom · drag to pan</span>
      </div>
      <div class="map-legend">${legend
        .map(([key, text, shape]) => `<span><i class="${shape}" style="--c:${MARKER_COLORS[key]}"></i>${text}</span>`)
        .join("")}</div>
      <div class="actions"><button class="btn" data-action="close">Close (M)</button></div>`;

    this.canvas = this.element.querySelector("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.ctx.scale(dpr, dpr);
    this.attachCanvasInput();

    const initial = this.view ?? { scale: 0, width, height };
    this.view = { ...initial, width, height };
    if (!initial.scale) {
      // Dungeons are small enough to show whole; the overworld opens zoomed in on you.
      if (game.inDungeon) this.showWhole();
      else this.centerOnPlayer(Math.max(this.zoomLimits().min, MAP_OPEN_TILE_PX));
    } else {
      this.draw();
    }
  }

  draw() {
    if (!this.ctx) return;
    drawMapView(this.ctx, this.game, this.view, this.painted, { labels: true });
  }

  attachCanvasInput() {
    this.removeWindowListeners?.();
    const canvas = this.canvas;
    const local = (e) => {
      const rect = canvas.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    };
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, ...local(e));
      },
      { passive: false },
    );
    canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      this.drag = { start: local(e), view: this.view };
      canvas.classList.add("dragging");
    });
    // Move/up on the window so a drag that leaves the canvas still ends cleanly.
    const move = (e) => {
      if (!this.drag) return;
      const [x, y] = local(e);
      const { start, view } = this.drag;
      this.setView({ ...view, x: view.x - (x - start[0]) / view.scale, y: view.y - (y - start[1]) / view.scale });
    };
    const up = () => {
      this.drag = null;
      canvas.classList.remove("dragging");
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    this.removeWindowListeners = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }

  close() {
    this.removeWindowListeners?.();
    this.drag = null;
    this.ctx = null;
    super.close();
  }
}
