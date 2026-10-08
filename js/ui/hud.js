import { CHUNK_SIZE } from "../config.js";
import { WEAPONS, WEAPON_ORDER } from "../data/weapons.js";
import { maxHp, maxMana, weaponDamage } from "../systems/stats.js";

const DEBUG_REFRESH_INTERVAL = 0.2; // s

/** HP/mana bars, weapon slots, and the debug readout. */
export class Hud {
  constructor({ debug, hpBar, manaBar, weapons }) {
    this.debug = debug;
    this.hpBar = hpBar;
    this.manaBar = manaBar;
    this.slots = WEAPON_ORDER.map((id, i) => createSlot(weapons, WEAPONS[id], i + 1));
    this.cache = new Map();
    this.debugElapsed = DEBUG_REFRESH_INTERVAL;
    this.frames = 0;
  }

  update(frameTime, game) {
    const { player } = game;
    this.updateBar(this.hpBar, player.hp, maxHp(player.stats));
    this.updateBar(this.manaBar, player.mana, maxMana(player.stats));

    for (const slot of this.slots) {
      const { weapon } = slot;
      const active = player.weapon === weapon.id;
      slot.element.classList.toggle("active", active);
      this.setText(slot.damage, `${weaponDamage(weapon, player.stats)} dmg`);
      this.setText(slot.cost, costLabel(weapon, player));
      slot.element.classList.toggle("empty", isOutOfAmmo(weapon, player));
      const cooldown = active ? player.attackCooldown / weapon.cooldown : 0;
      slot.cooldown.style.transform = `scaleY(${cooldown})`;
    }

    this.updateDebug(frameTime, game);
  }

  updateBar(bar, value, max) {
    bar.querySelector(".fill").style.transform = `scaleX(${max > 0 ? value / max : 0})`;
    this.setText(bar.querySelector(".label"), `${value} / ${max}`);
  }

  updateDebug(frameTime, game) {
    this.debugElapsed += frameTime;
    this.frames++;
    if (this.debugElapsed < DEBUG_REFRESH_INTERVAL) return;

    const fps = Math.round(this.frames / this.debugElapsed);
    this.debugElapsed = 0;
    this.frames = 0;

    const { world, player } = game;
    const tx = player.tileX;
    const ty = player.tileY;
    this.debug.innerHTML = [
      row("Seed", world.seed),
      row("Tile", `${tx}, ${ty}`),
      row("Chunk", `${Math.floor(tx / CHUNK_SIZE)}, ${Math.floor(ty / CHUNK_SIZE)}`),
      row("Zone", game.isPlayerSafe() ? "Village (safe)" : "Wilderness"),
      row("Zombies", game.zombies.length),
      row("FPS", fps),
    ].join("");
  }

  // Writes text only when it changed, to avoid needless DOM work every frame.
  setText(element, text) {
    if (this.cache.get(element) === text) return;
    this.cache.set(element, text);
    element.textContent = text;
  }
}

function createSlot(container, weapon, number) {
  const element = document.createElement("div");
  element.className = `weapon-slot weapon-${weapon.id}`;
  element.innerHTML = `
    <div class="cooldown"></div>
    <span class="key">${number}</span>
    <span class="name">${weapon.name}</span>
    <span class="damage"></span>
    <span class="cost"></span>`;
  container.appendChild(element);
  return {
    weapon,
    element,
    cooldown: element.querySelector(".cooldown"),
    damage: element.querySelector(".damage"),
    cost: element.querySelector(".cost"),
  };
}

function costLabel(weapon, player) {
  if (weapon.arrowCost) return `${player.arrows} arrows`;
  if (weapon.manaCost) return `${weapon.manaCost} mana`;
  return "free";
}

function isOutOfAmmo(weapon, player) {
  return (weapon.arrowCost && player.arrows < weapon.arrowCost) || (weapon.manaCost && player.mana < weapon.manaCost);
}

function row(label, value) {
  return `<div class="hud-row"><span>${label}</span><span>${value}</span></div>`;
}
