import { ITEMS, SLOT_NAMES } from "../data/items.js";
import { damageReduction } from "../systems/combat.js";

const SLOT_GLYPHS = { helmet: "H", chest: "C", legs: "L", gloves: "G", boots: "B" };

/** Icon markup for an item instance (or a bare defId). `attrs` adds data attributes for click handling. */
export function itemIcon(defId, qty = 1, attrs = "") {
  const def = ITEMS[defId];
  const glyph = def.type === "armor" ? SLOT_GLYPHS[def.slot] : def.resource === "hp" ? "♥" : "◆";
  const classes = ["item-icon", `type-${def.type}`];
  if (def.tier) classes.push(`tier-${def.tier}`);
  if (def.resource) classes.push(`res-${def.resource}`, def.effect.percent ? "greater" : "minor");
  return `<div class="${classes.join(" ")}" data-item="${defId}" ${attrs}>
    <span class="glyph">${glyph}</span>${qty > 1 ? `<span class="qty">${qty}</span>` : ""}
  </div>`;
}

/**
 * A grid of slots; empty slots render as blanks. `attrsFor(i)` supplies per-item data
 * attributes; `gridAttrs` goes on the grid itself (e.g. a drop-zone marker).
 */
export function slotGrid(slots, attrsFor, gridAttrs = "") {
  return `<div class="slot-grid" ${gridAttrs}>${slots
    .map((slot, i) => (slot ? itemIcon(slot.defId, slot.qty, attrsFor(i)) : `<div class="item-icon empty"></div>`))
    .join("")}</div>`;
}

/** Tooltip text lines for an item, comparing armor against what the player has equipped. */
export function describeItem(defId, player, { price } = {}) {
  const def = ITEMS[defId];
  const lines = [`<strong class="tier-text-${def.tier ?? def.type}">${def.name}</strong>`];
  if (def.type === "armor") {
    lines.push(`<span class="dim">Armor · ${SLOT_NAMES[def.slot]}</span>`);
    const equipped = player.equipment[def.slot];
    const delta = def.armor - (equipped ? ITEMS[equipped.defId].armor : 0);
    const compare =
      equipped?.defId === defId ? "" : delta > 0 ? ` <span class="gain">(+${delta})</span>` : delta < 0 ? ` <span class="loss">(${delta})</span>` : " (same)";
    lines.push(`Armor ${def.armor}${compare}`);
  } else {
    const what = def.resource === "hp" ? "HP" : "mana";
    lines.push(def.effect.flat ? `Restores ${def.effect.flat} ${what}` : `Restores ${def.effect.percent * 100}% of max ${what}`);
  }
  lines.push(price === undefined ? `<span class="dim">Sells for ${def.sellPrice} g</span>` : `<span class="gold-text">${price} g</span>`);
  return lines.join("<br>");
}

export function armorSummary(armor) {
  return `${armor} armor · ${Math.round(damageReduction(armor) * 100)}% damage reduction`;
}

/** Floating tooltip shown while hovering any [data-item] element. */
export class Tooltip {
  constructor(element, game) {
    this.element = element;
    this.game = game;
    document.addEventListener("mouseover", (e) => {
      const target = e.target.closest("[data-item]");
      if (!target) {
        this.hide();
        return;
      }
      const price = target.dataset.price === undefined ? undefined : Number(target.dataset.price);
      const hint = target.dataset.hint ? `<br><span class="hint">${target.dataset.hint}</span>` : "";
      this.element.innerHTML = describeItem(target.dataset.item, this.game().player, { price }) + hint;
      this.element.hidden = false;
    });
    document.addEventListener("mousemove", (e) => {
      if (this.element.hidden) return;
      const x = Math.min(e.clientX + 14, window.innerWidth - this.element.offsetWidth - 8);
      const y = Math.min(e.clientY + 14, window.innerHeight - this.element.offsetHeight - 8);
      this.element.style.transform = `translate(${x}px, ${y}px)`;
    });
  }

  hide() {
    this.element.hidden = true;
  }
}
