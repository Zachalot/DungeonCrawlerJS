import { Camera } from "./camera.js";
import { Auth } from "./cloud/auth.js";
import { CloudSaves } from "./cloud/cloudSaves.js";
import { SyncStatus, SyncedSaveStore } from "./cloud/sync.js";
import { AUTOSAVE_INTERVAL, MAX_FRAME_TIME, UPDATE_HZ } from "./config.js";
import { WEAPONS, WEAPON_ORDER } from "./data/weapons.js";
import { Game } from "./game.js";
import { Input } from "./input.js";
import {
  drawDarkness,
  drawEffects,
  drawEntities,
  drawGraveArrow,
  drawHitboxes,
  drawInteractions,
  drawLabels,
  drawProjectiles,
  drawWorld,
} from "./render.js";
import { randomSeed } from "./rng.js";
import { SaveStore, restoreGame } from "./save.js";
import { CharacterSheet } from "./ui/character.js";
import { ChestPanel } from "./ui/chest.js";
import { DevPanel, devPanelEnabled } from "./ui/devPanel.js";
import { Hud } from "./ui/hud.js";
import { InventoryPanel } from "./ui/inventory.js";
import { MapPanel, Minimap } from "./ui/maps.js";
import { Tooltip } from "./ui/items.js";
import { PauseMenu } from "./ui/pause.js";
import { QuickWheel } from "./ui/quickWheel.js";
import { StashPanel } from "./ui/stash.js";
import { TitleScreen } from "./ui/title.js";
import { Toasts } from "./ui/toast.js";
import { TrainerDialog } from "./ui/trainer.js";
import { VendorDialog } from "./ui/vendor.js";

const STEP = 1 / UPDATE_HZ;
const IMMEDIATE_SYNC = new Set(["death", "chest", "grave"]); // autosaves pushed to the cloud without the debounce

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

/** Saves made without an account (the original localStorage slots). */
const guestStore = new SaveStore();
/** The signed-in account (null if accounts are unavailable) and the slots in use: guest, or the account's synced slots. */
let auth = null;
let store = guestStore;
let authChanges = Promise.resolve(); // sign-in/out handling, one at a time
let warnedOffline = false;

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
  pause: new PauseMenu(modal, getGame, {
    ...callbacks,
    onSave: () => saveNow("manual", { immediate: true }),
    onQuit: quitToTitle,
    onSignOut: signOut,
    slot: () => slot,
    account: () => (auth?.user ? { name: auth.username ?? auth.email, status: store.status } : null),
  }),
  map: new MapPanel(modal, getGame, callbacks),
};
const TOGGLE_KEYS = { KeyC: "character", KeyI: "inventory", KeyM: "map" };
const minimap = new Minimap(document.getElementById("minimap"));
const devPanel = devPanelEnabled(location) ? new DevPanel(document.getElementById("dev-panel"), getGame) : null;
let activePanel = null;

const wheel = new QuickWheel(document.getElementById("quick-wheel"), getGame);
let wheelAim = { x: 0, y: 0 }; // aim frozen while the wheel is open

const title = new TitleScreen(document.getElementById("title"), {
  getStore: () => store,
  getAuth: () => auth,
  guestStore,
  defaultSeed: seedFromUrl(),
  onContinue: (s) => startGame(s, restoreGame(store.load(s))),
  onNewGame: (s, seed) => {
    const fresh = new Game(seed ?? randomSeed());
    store.save(s, fresh, { immediate: true });
    startGame(s, fresh);
  },
  onImport: (s, data) => {
    store.save(s, data, { immediate: true });
    startGame(s, restoreGame(data));
  },
  onSignOut: async () => {
    await store.flush?.();
    await auth.signOut();
  },
});

document.getElementById("menu-button").addEventListener("click", () => openPanel("pause"));
window.addEventListener("resize", resize);
window.addEventListener("beforeunload", () => saveNow("unload", { immediate: true }));
window.addEventListener("online", () => store.flush?.());
setInterval(() => {
  if (game && !document.hidden) saveNow("interval");
}, AUTOSAVE_INTERVAL * 1000);
resize();
title.showLoading();
initAccounts();

let lastTime = performance.now();
let accumulator = 0;
requestAnimationFrame(frame);

/** Restores the session (if any) and shows the title. Without accounts the game is guest-only. */
async function initAccounts() {
  try {
    auth = await Auth.create();
  } catch (error) {
    console.warn("Accounts unavailable", error);
    title.cloudNote = "Accounts and cloud saves are unavailable right now (couldn't load the sign-in service).";
  }
  if (auth) {
    await useAccountStore();
    auth.onChange((event) => {
      authChanges = authChanges.then(() => onAuthChange(event)); // one switch at a time
    });
  }
  if (!game) showTitle();
}

async function onAuthChange(event) {
  if (event === "PASSWORD_RECOVERY") {
    if (!game) title.show();
    return;
  }
  if (auth.userId === store.owner) return; // token refresh, profile update, etc.
  if (game) {
    saveNow("quit", { immediate: true });
    await store.flush?.();
    closePanel();
  }
  await useAccountStore();
  showTitle();
}

/** Points `store` at the signed-in account's synced slots, or the guest slots when signed out. */
async function useAccountStore() {
  warnedOffline = false;
  if (!auth.user) {
    store = guestStore;
    return;
  }
  await auth.loadProfile();
  store = new SyncedSaveStore(new SaveStore(localStorage, { owner: auth.userId }), new CloudSaves(auth.client), {
    onStatus: onSyncStatus,
  });
}

function onSyncStatus(status) {
  if (!game) return;
  if (status === SyncStatus.offline && !warnedOffline) {
    warnedOffline = true;
    toasts.show("Can't reach the cloud. Your progress is saved on this device and will sync when the connection is back.");
  } else if (status === SyncStatus.conflict) {
    toasts.show("This slot was also saved on another device. Your progress is kept here; choose which copy to keep on the title screen.");
  } else if (status === SyncStatus.synced) {
    warnedOffline = false;
  }
}

async function signOut() {
  saveNow("quit", { immediate: true });
  await store.flush?.();
  closePanel();
  await auth.signOut(); // onAuthChange switches to the guest slots and shows the title
}

function startGame(newSlot, newGame) {
  slot = newSlot;
  game = newGame;
  window.game = game; // console debugging, alongside the dev panel (`)
  accumulator = 0;
  title.hide();
  gameUi.hidden = false;
  syncCamera(0);
}

function showTitle() {
  wheel.cancel();
  devPanel?.hide();
  game = null;
  slot = null;
  gameUi.hidden = true;
  title.show();
}

function quitToTitle() {
  saveNow("quit", { immediate: true });
  closePanel();
  showTitle(); // its cloud pull queues behind the push above
}

/**
 * Writes the running game to its slot. Never throws: a failed save is reported, not fatal.
 * Signed in, the save lands on this device now and in the cloud shortly after (or right away if `immediate`).
 */
function saveNow(reason, { immediate = false } = {}) {
  if (!game) return;
  try {
    store.save(slot, game, { immediate });
    const offline = store.status === SyncStatus.offline;
    flashSaveIndicator(`${reason === "manual" ? "Saved" : "Autosaved"}${offline ? " on this device" : ""}`);
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
    input.consumeReleased();
    input.consumeAttackPress();
    return;
  }
  handlePresses(input.consumePressed(), input.consumeReleased());
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
  const autosaves = [];
  for (const event of game.events.splice(0)) {
    if (event.type === "toast") toasts.show(event.text);
    if (event.type === "autosave") autosaves.push(event.reason);
  }
  if (autosaves.length) saveNow("event", { immediate: autosaves.some((reason) => IMMEDIATE_SYNC.has(reason)) });

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
  drawHitboxes(ctx, game, alpha, camera);
  drawGraveArrow(ctx, game, alpha, camera);
  hud.update(frameTime, game);
  minimap.update(frameTime, game);
}

function handlePresses(pressed, released) {
  if (pressed.has("Backquote") && devPanel) devPanel.toggle();
  if (wheel.isOpen && handleWheel(pressed, released)) return;
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
  if (pressed.has("KeyQ") && !wheel.isOpen) {
    wheelAim = camera.screenToWorld(input.mouse.x, input.mouse.y);
    wheel.open(input.mouse.x, input.mouse.y);
  }
}

/**
 * While the wheel is open: releasing Q drinks the highlighted potion (or cancels in the
 * middle), Esc cancels, and anything else just tracks the mouse. Returns true if the
 * press was consumed (Esc shouldn't also open the pause menu).
 */
function handleWheel(pressed, released) {
  if (pressed.has("Escape")) {
    wheel.cancel();
    return true;
  }
  if (released.has("KeyQ")) {
    const choice = wheel.confirm();
    if (choice) game.drinkPotion(choice);
    return false;
  }
  if (!input.keys.has("KeyQ")) {
    wheel.cancel(); // Q was lost without a keyup, e.g. the window lost focus
    return false;
  }
  wheel.update(input.mouse.x, input.mouse.y);
  return false;
}

function openPanel(id) {
  wheel.cancel();
  if (activePanel) panels[activePanel].close();
  activePanel = id;
  input.mouse.down = false; // the click that opened a panel must not become an attack
  input.consumeAttackPress();
  modal.classList.toggle("wide", panels[id].wide);
  modal.dataset.panel = id; // lets CSS size specific panels (e.g. the map)
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
  // The mouse belongs to the quick wheel while it's open: no attacks, and aim stays put.
  const wheelOpen = wheel.isOpen;
  const attackPressed = input.consumeAttackPress();
  return {
    move: input.moveVector(),
    aim: wheelOpen ? wheelAim : camera.screenToWorld(input.mouse.x, input.mouse.y),
    attack: !wheelOpen && input.isAttacking(),
    attackPressed: !wheelOpen && attackPressed,
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
