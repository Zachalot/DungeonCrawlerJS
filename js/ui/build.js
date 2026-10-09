import { MATERIALS } from "../data/enemies.js";
import { STRUCTURES, structureCost } from "../data/structures.js";
import { Panel } from "./panel.js";

/** "50 stone, 30 wood" with what's missing in red. */
export function costLabel(cost, materials) {
  return Object.entries(cost)
    .map(([id, n]) => {
      const short = materials[id] < n;
      return `<span class="${short ? "loss" : ""}">${n} ${MATERIALS[id].name.toLowerCase()}</span>`;
    })
    .join(", ");
}

/**
 * Build menu (B, in the village): builds a structure or moves one you have. Choosing one closes
 * the menu and starts placing it (callbacks.onPlace): click a spot in the village to put it down.
 * Materials are paid when it's placed; moving is free.
 */
export class BuildPanel extends Panel {
  onAction(action, { kind }) {
    if (action === "place") {
      this.callbacks.onPlace(kind);
      return false;
    }
    if (action === "close") {
      this.callbacks.onClose();
      return false;
    }
  }

  render() {
    const { game } = this;
    const { materials } = game.player;
    const rows = Object.values(STRUCTURES)
      .map((def) => {
        const built = game.structure(def.id);
        const cost = structureCost(def.id, 1);
        const affordable = Object.keys(game.missingMaterials(def.id, 1)).length === 0;
        const action = built
          ? `<button class="btn small" data-action="place" data-kind="${def.id}">Move</button>`
          : `<button class="btn small primary" data-action="place" data-kind="${def.id}" ${affordable ? "" : "disabled"}>Build</button>`;
        return `<div class="shop-row build-row">
          <div class="item-icon type-structure"><span class="glyph">${def.id === "enchantingTable" ? "✧" : "⚗"}</span></div>
          <span class="name">${def.name}${built ? ` <span class="dim">· level ${built.level}</span>` : ""}<br><span class="dim small">${def.about} ${def.w}×${def.h} tiles.</span></span>
          <span class="small">${built ? "Built" : costLabel(cost, materials)}</span>
          ${action}
        </div>`;
      })
      .join("");
    this.element.innerHTML = `
      <h2>Build <span class="dim">Wood ${materials.wood} · Stone ${materials.stone}</span></h2>
      <p class="dim small">Chop trees and mine rocks (hold F next to them, with an axe or pickaxe from the General Vendor) to gather materials.
        Upgrade a structure from its own menu.</p>
      <div class="shop-list">${rows}</div>
      <div class="actions"><button class="btn" data-action="close">Close (B)</button></div>`;
  }
}
