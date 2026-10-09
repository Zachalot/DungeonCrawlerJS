import { WEAPONS } from "../data/weapons.js";
import { STAT_KEYS, previewStats, xpToNext } from "../systems/leveling.js";
import { maxHp, maxMana, weaponDamage } from "../systems/stats.js";
import { armorSummary } from "./items.js";
import { Panel } from "./panel.js";

const STAT_INFO = {
  str: { name: "Strength", effect: "Sword damage ×1" },
  int: { name: "Intellect", effect: "Fireball damage ×1.5, mana ×10" },
  dex: { name: "Dexterity", effect: "Arrow damage ×1.5" },
  end: { name: "Endurance", effect: "Max HP ×10" },
};

const DERIVED = [
  { label: "Max HP", value: (s) => maxHp(s) },
  { label: "Max Mana", value: (s) => maxMana(s) },
  { label: "Sword damage", value: (s) => weaponDamage(WEAPONS.sword, s) },
  { label: "Arrow damage", value: (s) => weaponDamage(WEAPONS.bow, s) },
  { label: "Fireball damage", value: (s) => weaponDamage(WEAPONS.staff, s) },
];

/** Character sheet: stage stat points with a live derived-stat preview, then Confirm or Cancel. */
export class CharacterSheet extends Panel {
  onOpen() {
    this.pending = emptyPending();
  }

  pendingTotal() {
    return STAT_KEYS.reduce((sum, key) => sum + this.pending[key], 0);
  }

  onAction(action, { stat }) {
    const remaining = this.game.player.unspentPoints - this.pendingTotal();
    if (action === "add" && remaining > 0) this.pending[stat]++;
    else if (action === "remove" && this.pending[stat] > 0) this.pending[stat]--;
    else if (action === "reset") this.pending = emptyPending();
    else if (action === "confirm" && this.game.allocateStats(this.pending)) this.pending = emptyPending();
    else if (action === "close") {
      this.callbacks.onClose();
      return false;
    }
  }

  render() {
    const { player } = this.game;
    const total = this.pendingTotal();
    const remaining = player.unspentPoints - total;
    const preview = previewStats(player.stats, this.pending);

    const statRows = STAT_KEYS.map((key) => {
      const pending = this.pending[key];
      return `
        <tr>
          <th>${STAT_INFO[key].name}<small>${STAT_INFO[key].effect}</small></th>
          <td class="num">${player.stats[key]}${pending ? `<span class="gain"> +${pending}</span>` : ""}</td>
          <td class="controls">
            <button class="btn small" data-action="remove" data-stat="${key}" ${pending ? "" : "disabled"} aria-label="Remove ${STAT_INFO[key].name}">−</button>
            <button class="btn small" data-action="add" data-stat="${key}" ${remaining > 0 ? "" : "disabled"} aria-label="Add ${STAT_INFO[key].name}">+</button>
          </td>
        </tr>`;
    }).join("");

    const derivedRows = DERIVED.map(({ label, value }) => {
      const now = value(player.stats);
      const next = value(preview);
      return `<tr><th>${label}</th><td class="num">${now}${next !== now ? ` <span class="gain">→ ${next}</span>` : ""}</td></tr>`;
    }).join("");

    this.element.innerHTML = `
      <h2>Character <span class="dim">Level ${player.level}</span></h2>
      <p class="dim">XP ${player.xp} / ${xpToNext(player.level)} &middot; ${player.gold} g &middot; ${armorSummary(player.armor)}</p>
      <p class="points ${remaining > 0 ? "has-points" : ""}">${remaining} stat point${remaining === 1 ? "" : "s"} available</p>
      <table class="stats">${statRows}</table>
      <h3>Derived</h3>
      <table class="derived">${derivedRows}</table>
      <div class="actions">
        <button class="btn" data-action="reset" ${total ? "" : "disabled"}>Reset</button>
        <button class="btn primary" data-action="confirm" ${total ? "" : "disabled"}>Confirm</button>
        <button class="btn" data-action="close">Close (C)</button>
      </div>`;
  }
}

function emptyPending() {
  return Object.fromEntries(STAT_KEYS.map((key) => [key, 0]));
}
