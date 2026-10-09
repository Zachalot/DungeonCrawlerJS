import { Camera } from "./camera.js";
import { AUTOSAVE_INTERVAL, MAX_FRAME_TIME, UPDATE_HZ } from "./config.js";
import { POTION_PRIORITY } from "./data/items.js";
import { WEAPONS, WEAPON_ORDER } from "./data/weapons.js";
import { countItem } from "./systems/inventory.js";
import { Game } from "./game.js";
import { Input } from "./input.js";
import {
  drawDarkness,
  drawEffects,
  drawEntities,
  drawGraveArrow,
  drawInteractions,
  drawLabels,
  drawProjectiles,
  drawWorld,
} from "./render.js";
import { randomSeed } from "./rng.js";
import { SaveStore, restoreGame } from "./save.js";
import { CharacterSheet } from "./ui/character.js";
import { ChestPanel } from "./ui/chest.js";
import { Hud } from "./ui/hud.js";
import { InventoryPanel } from "./ui/inventory.js";
import { Tooltip } from "./ui/items.js";
import { PauseMenu } from "./ui/pause.js";
import { StashPanel } from "./ui/stash.js";
import { TitleScreen } from "./ui/title.js";
import { Toasts } from "./ui/toast.js";
import { TrainerDialog } from "./ui/trainer.js";
import { VendorDialog } from "./ui/vendor.js";

const STEP = 1 / UPDATE_HZ;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const store = new SaveStore();

/** The running game and the slot it saves to; both null on the title screen. */
let game = null;
let slot = null;
const getGame = () => game;

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
  potions: document.getElementById("potions"),
});
const toasts = new Toasts(document.getElementById("toasts"));
const tooltip = new Tooltip(document.getElementById("tooltip"), getGame);
const saveIndicator = document.getElementById("save-indicator");
const gameUi = document.getElementById("game-ui");

// Modal panels. While one is open the simulation is paused.
const modalBackdrop = document.getElementById("modal-backdrop");
const modal = document.getElementById("modal");
const callbacks = { onClose: closePanel };
const panels = {
  character: new CharacterSheet(modal, getGame, callbacks),
  inventory: new InventoryPanel(modal, getGame, callbacks),
  trainer: new TrainerDialog(modal, getGame, { ...callbacks, onRespec: () => openPanel("character") }),
  potionVendor: new VendorDialog(modal, getGame, callbacks, "potionVendor"),
  generalVendor: new VendorDialog(modal, getGame, callbacks, "generalVendor"),
  stash: new StashPanel(modal, getGame, callbacks),
  chest: new ChestPanel(modal, getGame, callbacks),
  pause: new PauseMenu(modal, getGame, { ...callbacks, onSave: () => saveNow("manual"), onQuit: quitToTitle, slot: () => slot }),
};
const TOGGLE_KEYS = { KeyC: "character", KeyI: "inventory" };
let activePanel = null;

const title = new TitleScreen(document.getElementById("title"), store, {
  defaultSeed: seedFromUrl(),
  onContinue: (s) => startGame(s, restoreGame(store.load(s))),
  onNewGame: (s, seed) => {
    const fresh = new Game(seed ?? randomSeed());
    store.save(s, fresh);
    startGame(s, fresh);
  },
  onImport: (s, data) => {
    store.save(s, data);
    startGame(s, restoreGame(data));
  },
});

document.getElementById("menu-button").addEventListener("click", () => openPanel("pause"));
window.addEventListener("resize", resize);
window.addEventListener("beforeunload", () => saveNow("unload"));
setInterval(() => {
  if (game && !document.hidden) saveNow("interval");
}, AUTOSAVE_INTERVAL * 1000);
resize();
showTitle();

let lastTime = performance.now();
let accumulator = 0;
requestAnimationFrame(frame);

function startGame(newSlot, newGame) {
  slot = newSlot;
  game = newGame;
  window.game = game; // console debugging until the M7 dev panel
  accumulator = 0;
  title.hide();
  gameUi.hidden = false;
  syncCamera(0);
}

function showTitle() {
  game = null;
  slot = null;
  gameUi.hidden = true;
  title.show();
}

function quitToTitle() {
  saveNow("quit");
  closePanel();
  showTitle();
}

/** Writes the running game to its slot. Never throws: a failed save is reported, not fatal. */
function saveNow(reason) {
  if (!game) return;
  try {
    store.save(slot, game);
    flashSaveIndicator(reason === "manual" ? "Saved" : "Autosaved");
  } catch (error) {
    console.error("Save failed", error);
    toasts.show(`Save failed: ${error.message}`);
  }
}

function flashSaveIndicator(text) {
  saveIndicator.textContent = text;
  saveIndicator.classList.remove("show");
  void saveIndicator.offsetWidth; // restart the fade animation
  saveIndicator.classList.add("show");
}

function frame(now) {
  const frameTime = Math.min((now - lastTime) / 1000, MAX_FRAME_TIME);
  lastTime = now;
  requestAnimationFrame(frame);
  if (!game) {
    input.consumePressed();
    input.consumeAttackPress();
    return;
  }
  handlePresses(input.consumePressed());
  if (!game) return; // quit to title from a key press

  if (activePanel) {
    accumulator = 0;
  } else {
    accumulator += frameTime;
    while (accumulator >= STEP) {
      game.update(STEP, readControls());
      accumulator -= STEP;
    }
  }
  let shouldSave = false;
  for (const event of game.events.splice(0)) {
    if (event.type === "toast") toasts.show(event.text);
    if (event.type === "autosave") shouldSave = true;
  }
  if (shouldSave) saveNow("event");

  const alpha = accumulator / STEP;
  syncCamera(alpha);

  ctx.clearRect(0, 0, camera.width, camera.height);
  drawWorld(ctx, game.area, camera);
  drawProjectiles(ctx, game.projectiles, alpha, camera);
  drawEntities(ctx, game, alpha, camera);
  drawEffects(ctx, game.effects, camera);
  drawDarkness(ctx, game, alpha, camera);
  drawLabels(ctx, game, camera);
  drawInteractions(ctx, game, camera);
  drawGraveArrow(ctx, game, alpha, camera);
  hud.update(frameTime, game);
}

function handlePresses(pressed) {
  if (pressed.has("Escape")) {
    if (activePanel) closePanel();
    else openPanel("pause");
    return;
  }
  for (const [code, id] of Object.entries(TOGGLE_KEYS)) {
    if (!pressed.has(code)) continue;
    if (activePanel === id) closePanel();
    else openPanel(id);
    return;
  }
  if (activePanel) return;
  if (pressed.has("KeyF")) {
    const panel = game.interact();
    if (panel && panels[panel]) openPanel(panel);
  }
  // Interim until the quick-select wheel: drink the best potion of each kind.
  const best = (kind) => POTION_PRIORITY[kind].find((id) => countItem(game.player.inventory, id) > 0) ?? POTION_PRIORITY[kind][0];
  if (pressed.has("KeyQ")) game.drinkPotion(best("hp"));
  if (pressed.has("KeyE")) game.drinkPotion(best("mana"));
}

function openPanel(id) {
  if (activePanel) panels[activePanel].close();
  activePanel = id;
  input.mouse.down = false; // the click that opened a panel must not become an attack
  input.consumeAttackPress();
  modal.classList.toggle("wide", panels[id].wide);
  modalBackdrop.hidden = false;
  panels[id].open();
}

function closePanel() {
  if (!activePanel) return;
  panels[activePanel].close();
  activePanel = null;
  input.consumeAttackPress(); // presses made while paused don't carry over
  modalBackdrop.hidden = true;
  modal.innerHTML = "";
  tooltip.hide();
}

// Follows the player and shares the view with the game so zombies never spawn on screen.
function syncCamera(alpha) {
  const target = game.player.renderPosition(alpha);
  camera.follow(target.x, target.y, game.area);
  game.view = { x: camera.x, y: camera.y, width: camera.width, height: camera.height };
}

function readControls() {
  return {
    move: input.moveVector(),
    aim: camera.screenToWorld(input.mouse.x, input.mouse.y),
    attack: input.isAttacking(),
    attackPressed: input.consumeAttackPress(),
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

/** An optional ?seed= in the URL pre-fills the New game seed box. Progress lives in save slots, not the URL. */
function seedFromUrl() {
  const parsed = Number.parseInt(new URLSearchParams(location.search).get("seed"), 10);
  return Number.isFinite(parsed) ? parsed >>> 0 : null;
}
