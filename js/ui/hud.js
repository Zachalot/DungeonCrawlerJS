import { CHUNK_SIZE } from "../config.js";

const REFRESH_INTERVAL = 0.2; // s

/** M1 debug readout: seed, position, zone, FPS. */
export class Hud {
  constructor(element) {
    this.element = element;
    this.elapsed = REFRESH_INTERVAL;
    this.frames = 0;
    this.fps = 0;
  }

  update(frameTime, world, player) {
    this.elapsed += frameTime;
    this.frames++;
    if (this.elapsed < REFRESH_INTERVAL) return;

    this.fps = Math.round(this.frames / this.elapsed);
    this.elapsed = 0;
    this.frames = 0;

    const tx = player.tileX;
    const ty = player.tileY;
    const zone = world.isSafeZone(tx, ty) ? "Village (safe)" : "Wilderness";
    this.element.innerHTML = [
      row("Seed", world.seed),
      row("Tile", `${tx}, ${ty}`),
      row("Chunk", `${Math.floor(tx / CHUNK_SIZE)}, ${Math.floor(ty / CHUNK_SIZE)}`),
      row("Zone", zone),
      row("FPS", this.fps),
    ].join("");
  }
}

function row(label, value) {
  return `<div class="hud-row"><span>${label}</span><span>${value}</span></div>`;
}
