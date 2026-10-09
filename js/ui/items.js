import { ITEMS, SLOT_NAMES } from "../data/items.js";
import { WEAPONS } from "../data/weapons.js";
import { damageReduction } from "../systems/combat.js";
import { weaponDamage } from "../systems/stats.js";

const SLOT_GLYPHS = { helmet: "H", chest: "C", legs: "L", gloves: "G", boots: "B", sword: "Sw", bow: "Bo", staff: "St" };

/** Icon markup for an item instance (or a bare defId). `attrs` adds data attributes for click handling. */
export function itemIcon(defId, qty = 1, attrs = "") {
  const def = ITEMS[defId];
  const glyph = def.slot ? SLOT_GLYPHS[def.slot] : def.resource === "hp" ? "♥" : "◆";
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

/** Tooltip text lines for an item, comparing armor or weapon bonus against what the player has equipped. */
export function describeItem(defId, player, { price } = {}) {
  const def = ITEMS[defId];
  const lines = [`<strong class="tier-text-${def.tier ?? def.type}">${def.name}</strong>`];
  if (def.type === "armor") {
    lines.push(`<span class="dim">Armor · ${SLOT_NAMES[def.slot]} slot</span>`);
    lines.push(`Armor ${def.armor}${compareTo(def, player, "armor")}`);
  } else if (def.type === "weapon") {
    const weapon = WEAPONS[def.slot];
    lines.push(`<span class="dim">Weapon · ${SLOT_NAMES[def.slot]} slot</span>`);
    lines.push(`Damage ${weapon.stat.toUpperCase()} × ${weapon.multiplier} + ${def.weaponBonus}${compareTo(def, player, "weaponBonus")}`);
    lines.push(`<span class="dim">Now ${weaponDamage(weapon, player.stats, { defId })} per hit</span>`);
  } else {
    const what = def.resource === "hp" ? "HP" : "mana";
    lines.push(def.effect.flat ? `Restores ${def.effect.flat} ${what}` : `Restores ${def.effect.percent * 100}% of max ${what}`);
  }
  lines.push(price === undefined ? `<span class="dim">Sells for ${def.sellPrice} g</span>` : `<span class="gold-text">${price} g</span>`);
  return lines.join("<br>");
}

// " (+3)" / " (-2)" / " (same)" versus the item in the same slot; "" if this is the equipped one.
function compareTo(def, player, field) {
  const equipped = player.equipment[def.slot];
  if (equipped?.defId === def.id) return "";
  const delta = def[field] - (equipped ? ITEMS[equipped.defId][field] : 0);
  if (delta > 0) return ` <span class="gain">(+${delta})</span>`;
  if (delta < 0) return ` <span class="loss">(${delta})</span>`;
  return " (same)";
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
