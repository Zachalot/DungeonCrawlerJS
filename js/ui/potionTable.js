import { MATERIALS } from "../data/enemies.js";
import { POTION_KINDS, potionId } from "../data/items.js";
import { structureCost } from "../data/structures.js";
import { recipe } from "../systems/crafting.js";
import { costLabel } from "./build.js";
import { itemIcon } from "./items.js";
import { Panel } from "./panel.js";

/**
 * Potion Table: brew health, mana, and travel potions from goop and gold, at any level up to
 * the table's. Also upgrades the table and moves it (callbacks.onPlace).
 */
export class PotionTablePanel extends Panel {
  onOpen() {
    this.level = Math.min(this.game.structure("potionTable").level, this.game.player.level);
  }

  onAction(action, { kind }) {
    const { game } = this;
    const table = game.structure("potionTable");
    if (action === "down") this.level = Math.max(1, this.level - 1);
    else if (action === "up") this.level = Math.min(table.level, this.level + 1);
    else if (action === "brew") game.craftPotion(kind, this.level);
    else if (action === "upgrade") game.upgradeStructure("potionTable");
    else if (action === "move") {
      this.callbacks.onPlace("potionTable");
      return false;
    } else if (action === "close") {
      this.callbacks.onClose();
      return false;
    }
  }

  render() {
    const { game } = this;
    const { player } = game;
    const table = game.structure("potionTable");
    this.level = Math.min(this.level, table.level);

    const rows = Object.entries(POTION_KINDS)
      .map(([kind, { name }]) => {
        const { gold, materials } = recipe(kind, this.level);
        const enough = Object.entries(materials).every(([id, n]) => player.materials[id] >= n) && player.gold >= gold;
        const needs = Object.entries(materials)
          .map(([id, n]) => `<span class="${player.materials[id] < n ? "loss" : ""}">${n} ${MATERIALS[id].name.toLowerCase()}</span>`)
          .join(", ");
        return `<div class="shop-row">${itemIcon(potionId(kind, this.level))}
          <span class="name">${name} (Lv ${this.level})<br><span class="dim small">${needs}, <span class="${player.gold < gold ? "loss" : ""}">${gold} g</span></span></span>
          <span></span>
          <button class="btn small" data-action="brew" data-kind="${kind}" ${enough ? "" : "disabled"}>Brew</button>
        </div>`;
      })
      .join("");

    const nextCost = structureCost("potionTable", table.level + 1);
    const canUpgrade = Object.keys(game.missingMaterials("potionTable", table.level + 1)).length === 0;
    const goop = ["greenGoop", "redGoop", "blueGoop"].map((id) => `${MATERIALS[id].name} ${player.materials[id]}`).join(" · ");

    this.element.innerHTML = `
      <h2>Potion Table <span class="dim">Level ${table.level} · ${player.gold} g</span></h2>
      <p class="dim small">${goop}. Slimes drop goop: green from level 2 areas, red from level 3, blue from level 4.</p>
      <div class="slot-actions">
        <button class="btn small" data-action="down" ${this.level > 1 ? "" : "disabled"}>−</button>
        <span>Potion level <strong>${this.level}</strong> <span class="dim">(up to ${table.level})</span></span>
        <button class="btn small" data-action="up" ${this.level < table.level ? "" : "disabled"}>+</button>
      </div>
      <div class="shop-list">${rows}</div>
      <h3>Upgrade</h3>
      <p class="small">Level ${table.level + 1} (potions up to level ${table.level + 1}): ${costLabel(nextCost, player.materials)}</p>
      <div class="slot-actions">
        <button class="btn small" data-action="upgrade" ${canUpgrade ? "" : "disabled"}>Upgrade table</button>
        <button class="btn small" data-action="move">Move table</button>
      </div>
      <div class="actions"><button class="btn" data-action="close">Close (Esc)</button></div>`;
  }
}
