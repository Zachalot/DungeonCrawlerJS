import { EQUIP_SLOTS, ITEMS, SLOT_NAMES } from "../data/items.js";
import { isEquippable } from "../systems/inventory.js";
import { armorSummary, itemIcon, slotGrid } from "./items.js";
import { Panel } from "./panel.js";

/** Inventory (I): equipment paper doll plus the 24-slot bag. Click armor to equip, potions to drink. */
export class InventoryPanel extends Panel {
  constructor(...args) {
    super(...args);
    this.wide = true;
  }

  onAction(action, { index, slot }) {
    const { game } = this;
    if (action === "use") {
      const instance = game.player.inventory[Number(index)];
      const def = instance && ITEMS[instance.defId];
      if (def && isEquippable(def)) game.equip(Number(index));
      else if (def?.type === "consumable") game.drinkPotion(def.id);
    } else if (action === "unequip") {
      game.unequip(slot);
    } else if (action === "close") {
      this.callbacks.onClose();
      return false;
    }
  }

  render() {
    const { player } = this.game;
    const doll = EQUIP_SLOTS.map((slot) => {
      const equipped = player.equipment[slot];
      return `<div class="doll-slot">
        ${equipped ? itemIcon(equipped.defId, 1, `data-action="unequip" data-slot="${slot}" data-hint="Click to take off"`) : `<div class="item-icon empty"></div>`}
        <span>${equipped ? ITEMS[equipped.defId].name : `<span class="dim">${SLOT_NAMES[slot]}</span>`}</span>
      </div>`;
    }).join("");

    this.element.innerHTML = `
      <h2>Inventory <span class="dim">${player.gold} g &middot; ${player.arrows} arrows</span></h2>
      <div class="inventory-layout">
        <div class="doll">
          <h3>Equipped</h3>
          ${doll}
          <p class="dim small">${armorSummary(player.armor)}</p>
        </div>
        <div>
          <h3>Bag</h3>
          ${slotGrid(player.inventory, (i) => `data-action="use" data-index="${i}" data-hint="${isEquippable(ITEMS[player.inventory[i].defId]) ? "Click to equip" : "Click to drink"}"`)}
          <p class="dim small">Click armor to equip it, a potion to drink it, or equipped armor to take it off.</p>
        </div>
      </div>
      <div class="actions"><button class="btn" data-action="close">Close (I)</button></div>`;
  }
}
