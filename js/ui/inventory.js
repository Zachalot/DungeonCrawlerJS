import { EQUIP_SLOTS, ITEMS, SLOT_NAMES } from "../data/items.js";
import { isEquippable } from "../systems/inventory.js";
import { DragDrop, parseDragId } from "./dragDrop.js";
import { armorSummary, itemIcon, slotGrid } from "./items.js";
import { Panel } from "./panel.js";

/**
 * Drop rules for the inventory: "valid", "invalid" (accepted so we can explain), or null.
 *  - bag → its own equipment slot: valid; → any other slot: invalid
 *  - bag → another bag cell: valid (move or swap)
 *  - equipment → bag cell: valid (take off); → another equipment slot: invalid
 */
export function classifyInventoryDrop(source, target, player) {
  const [from, key] = parseDragId(source);
  const [to, targetKey] = parseDragId(target);
  if (from === "bag") {
    const def = ITEMS[player.inventory[Number(key)]?.defId];
    if (!def) return null;
    if (to === "equip") return isEquippable(def) && def.slot === targetKey ? "valid" : "invalid";
    return targetKey === key ? null : "valid";
  }
  if (from === "equip") {
    if (to === "bag") return "valid";
    return targetKey === key ? null : "invalid";
  }
  return null;
}

/**
 * Inventory (I): a stick figure with eight equipment slots, plus the 24-slot bag.
 * Drag gear onto the figure (or click it) to equip it, drag it back to take it off, or
 * drag between bag cells to rearrange. Clicking a potion drinks it.
 */
export class InventoryPanel extends Panel {
  constructor(...args) {
    super(...args);
    this.wide = true;
    this.dragDrop = new DragDrop(this.element, {
      classify: (source, target) => classifyInventoryDrop(source, target, this.game.player),
      onDrop: (source, target) => {
        this.drop(source, target);
        this.render();
      },
    });
  }

  drop(source, target) {
    const { game } = this;
    const [from, key] = parseDragId(source);
    const [to, targetKey] = parseDragId(target);
    if (from === "bag" && to === "equip") game.equipToSlot(Number(key), targetKey);
    else if (from === "bag" && to === "bag") game.moveInBag(Number(key), Number(targetKey));
    else if (from === "equip" && to === "bag") game.unequip(key, Number(targetKey));
    else if (from === "equip" && to === "equip") {
      const def = ITEMS[game.player.equipment[key].defId];
      game.toast(`${def.name} goes in the ${SLOT_NAMES[def.slot]} slot, not ${SLOT_NAMES[targetKey]}.`);
    }
  }

  onAction(action, { index, slot }) {
    const { game } = this;
    if (action === "use") {
      const def = ITEMS[game.player.inventory[Number(index)]?.defId];
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
    const slots = EQUIP_SLOTS.map((slot) => {
      const equipped = player.equipment[slot];
      const icon = equipped
        ? itemIcon(equipped.defId, 1, `data-action="unequip" data-slot="${slot}" data-drag="equip:${slot}" draggable="true" data-hint="Click or drag to the bag to take off"`)
        : `<div class="item-icon empty slot-empty"><span>${SLOT_NAMES[slot]}</span></div>`;
      return `<div class="figure-slot" style="grid-area: ${slot}" data-drop="equip:${slot}">
        ${icon}<span class="figure-label">${SLOT_NAMES[slot]}</span>
      </div>`;
    }).join("");

    const bagAttrs = (i) => {
      const hint = isEquippable(ITEMS[player.inventory[i].defId]) ? "Drag onto the figure or click to equip" : "Click to drink";
      return `data-action="use" data-index="${i}" data-drag="bag:${i}" data-drop="bag:${i}" draggable="true" data-hint="${hint}"`;
    };

    this.element.innerHTML = `
      <h2>Inventory <span class="dim">${player.gold} g &middot; ${player.arrows} arrows</span></h2>
      <div class="inventory-layout">
        <div class="figure-panel">
          <div class="figure">
            ${STICK_FIGURE}
            ${slots}
          </div>
          <p class="dim small">${armorSummary(player.armor)}</p>
        </div>
        <div>
          <h3>Bag</h3>
          ${slotGrid(player.inventory, bagAttrs, "", (i) => `data-drop="bag:${i}"`)}
          <p class="dim small">Drag gear onto its slot on the figure, or click it, to equip. Drag it back to the bag to take it off. Click a potion to drink it.</p>
        </div>
      </div>
      <div class="actions"><button class="btn" data-action="close">Close (I)</button></div>`;
  }
}

// Drawn behind the slot grid: head at the helmet slot, arms out to the hands, legs to the boots.
const STICK_FIGURE = `
  <svg class="stick-figure" viewBox="0 0 240 300" preserveAspectRatio="none" aria-hidden="true">
    <circle cx="120" cy="38" r="24" />
    <line x1="120" y1="62" x2="120" y2="190" />
    <line x1="120" y1="95" x2="40" y2="130" />
    <line x1="120" y1="95" x2="200" y2="130" />
    <line x1="120" y1="190" x2="80" y2="275" />
    <line x1="120" y1="190" x2="160" y2="275" />
  </svg>`;
