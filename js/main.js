import { Camera } from "./camera.js";
import { MAX_FRAME_TIME, UPDATE_HZ } from "./config.js";
import { WEAPONS, WEAPON_ORDER } from "./data/weapons.js";
import { Game } from "./game.js";
import { Input } from "./input.js";
import { drawEffects, drawEntities, drawLabels, drawNpcLabels, drawProjectiles, drawWorld } from "./render.js";
import { randomSeed } from "./rng.js";
import { CharacterSheet } from "./ui/character.js";
import { Hud } from "./ui/hud.js";
import { Toasts } from "./ui/toast.js";
import { TrainerDialog } from "./ui/trainer.js";

const STEP = 1 / UPDATE_HZ;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const game = new Game(resolveSeed());
window.game = game; // console debugging until the M7 dev panel
const camera = new Camera();
const input = new Input(canvas);
const hud = new Hud({
  debug: document.getElementById("debug"),
  hpBar: document.getElementById("hp-bar"),
  manaBar: document.getElementById("mana-bar"),
  xpBar: document.getElementById("xp-bar"),
  level: document.getElementById("level"),
  gold: document.getElementById("gold"),
  pointsHint: document.getElementById("points-hint"),
  weapons: document.getElementById("weapons"),
});
const toasts = new Toasts(document.getElementById("toasts"));

// Modal panels. While one is open the simulation is paused.
const modalBackdrop = document.getElementById("modal-backdrop");
const modal = document.getElementById("modal");
const panels = {
  character: new CharacterSheet(modal, game, { onClose: closePanel }),
  trainer: new TrainerDialog(modal, game, { onClose: closePanel, onRespec: () => openPanel("character") }),
};
let activePanel = null;

document.getElementById("new-world").addEventListener("click", () => {
  location.search = `?seed=${randomSeed()}`;
});

window.addEventListener("resize", resize);
resize();
syncCamera(0);

let lastTime = performance.now();
let accumulator = 0;
requestAnimationFrame(frame);

function frame(now) {
  const frameTime = Math.min((now - lastTime) / 1000, MAX_FRAME_TIME);
  lastTime = now;
  handlePresses(input.consumePressed());

  if (activePanel) {
    accumulator = 0;
  } else {
    accumulator += frameTime;
    while (accumulator >= STEP) {
      game.update(STEP, readControls());
      accumulator -= STEP;
    }
  }
  for (const event of game.events.splice(0)) {
    if (event.type === "toast") toasts.show(event.text);
  }

  const alpha = accumulator / STEP;
  syncCamera(alpha);

  ctx.clearRect(0, 0, camera.width, camera.height);
  drawWorld(ctx, game.world, camera);
  drawProjectiles(ctx, game.projectiles, alpha, camera);
  drawEntities(ctx, game, alpha, camera);
  drawEffects(ctx, game.effects, camera);
  drawLabels(ctx, game.world, camera);
  drawNpcLabels(ctx, game, camera);
  hud.update(frameTime, game);

  requestAnimationFrame(frame);
}

function handlePresses(pressed) {
  if (pressed.has("Escape") && activePanel) {
    closePanel();
  } else if (pressed.has("KeyC")) {
    if (activePanel === "character") closePanel();
    else openPanel("character");
  } else if (pressed.has("KeyF") && !activePanel) {
    const npc = game.nearbyNpc();
    if (npc && panels[npc.id]) openPanel(npc.id);
  }
}

function openPanel(id) {
  if (activePanel) panels[activePanel].close();
  activePanel = id;
  input.mouse.down = false; // the click that opened a panel must not become an attack
  modalBackdrop.hidden = false;
  panels[id].open();
}

function closePanel() {
  if (!activePanel) return;
  panels[activePanel].close();
  activePanel = null;
  modalBackdrop.hidden = true;
  modal.innerHTML = "";
}

// Follows the player and shares the view with the game so zombies never spawn on screen.
function syncCamera(alpha) {
  const target = game.player.renderPosition(alpha);
  camera.follow(target.x, target.y);
  game.view = { x: camera.x, y: camera.y, width: camera.width, height: camera.height };
}

function readControls() {
  return {
    move: input.moveVector(),
    aim: camera.screenToWorld(input.mouse.x, input.mouse.y),
    attack: input.isAttacking(),
    weapon: WEAPON_ORDER.find((id) => input.keys.has(WEAPONS[id].key)) ?? null,
  };
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
