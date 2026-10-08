import { Camera } from "./camera.js";
import { MAX_FRAME_TIME, UPDATE_HZ } from "./config.js";
import { Player } from "./entities/player.js";
import { Input } from "./input.js";
import { drawLabels, drawPlayer, drawWorld } from "./render.js";
import { randomSeed } from "./rng.js";
import { Hud } from "./ui/hud.js";
import { VILLAGE_SPAWN } from "./world/village.js";
import { World } from "./world/world.js";

const STEP = 1 / UPDATE_HZ;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const world = new World(resolveSeed());
const player = new Player(VILLAGE_SPAWN.x, VILLAGE_SPAWN.y);
const camera = new Camera();
const input = new Input(canvas);
const hud = new Hud(document.getElementById("debug"));

document.getElementById("new-world").addEventListener("click", () => {
  location.search = `?seed=${randomSeed()}`;
});

window.addEventListener("resize", resize);
resize();

let lastTime = performance.now();
let accumulator = 0;
requestAnimationFrame(frame);

function frame(now) {
  const frameTime = Math.min((now - lastTime) / 1000, MAX_FRAME_TIME);
  lastTime = now;
  accumulator += frameTime;

  while (accumulator >= STEP) {
    const aim = camera.screenToWorld(input.mouse.x, input.mouse.y);
    player.update(STEP, input.moveVector(), aim, world);
    accumulator -= STEP;
  }

  const alpha = accumulator / STEP;
  const view = player.renderPosition(alpha);
  camera.follow(view.x, view.y);

  ctx.clearRect(0, 0, camera.width, camera.height);
  drawWorld(ctx, world, camera);
  drawLabels(ctx, world, camera);
  drawPlayer(ctx, player, alpha, camera);
  hud.update(frameTime, world, player);

  requestAnimationFrame(frame);
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  camera.resize(width, height);
}

// Reads ?seed= from the URL, or picks one and writes it back so a refresh keeps the same world.
// Replaced by save-slot seeds in M6.
function resolveSeed() {
  const params = new URLSearchParams(location.search);
  const parsed = Number.parseInt(params.get("seed"), 10);
  if (Number.isFinite(parsed)) return parsed >>> 0;

  const seed = randomSeed();
  params.set("seed", seed);
  history.replaceState(null, "", `?${params}`);
  return seed;
}
