import { ITEMS } from "../data/items.js";
import { itemIcon } from "./items.js";
import { Panel } from "./panel.js";

/** Dungeon chest contents. Anything that doesn't fit stays here for later. */
export class ChestPanel extends Panel {
  onAction(action, { index }) {
    const { game } = this;
    if (action === "takeAll") game.takeAllFromChest();
    else if (action === "take") game.takeFromChest(Number(index));
    else if (action === "close") {
      this.callbacks.onClose();
      return false;
    }
  }

  render() {
    const chest = this.game.chestContents;
    if (!chest) {
      this.element.innerHTML = `<h2>Treasure Chest</h2><p class="dim">Nothing here.</p>
        <div class="actions"><button class="btn" data-action="close">Close (Esc)</button></div>`;
      return;
    }
    const empty = chest.gold === 0 && chest.items.length === 0;
    const rows = chest.items
      .map((entry, i) => {
        const icon = entry.arrows ? `<div class="item-icon type-ammo"><span class="glyph">➶</span></div>` : itemIcon(entry.defId, entry.qty);
        const name = entry.arrows ? `${entry.arrows} Arrows` : `${ITEMS[entry.defId].name}${entry.qty > 1 ? ` ×${entry.qty}` : ""}`;
        return `<div class="shop-row">${icon}<span class="name">${name}</span><span></span>
          <button class="btn small" data-action="take" data-index="${i}">Take</button></div>`;
      })
      .join("");

    this.element.innerHTML = `
      <h2>Treasure Chest</h2>
      ${empty ? `<p class="dim">You've taken everything. The dungeon is cleared.</p>` : ""}
      ${chest.gold ? `<p class="gold-text">${chest.gold} gold</p>` : ""}
      <div class="shop-list">${rows}</div>
      <div class="actions">
        <button class="btn primary" data-action="takeAll" ${empty ? "disabled" : ""}>Take all</button>
        <button class="btn" data-action="close">Close (Esc)</button>
      </div>`;
  }
}
