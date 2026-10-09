import { RUNE_BONUS } from "../config.js";
import { ITEMS, SLOT_NAMES } from "../data/items.js";
import { WEAPONS } from "../data/weapons.js";
import { damageReduction } from "../systems/combat.js";
import { runeCount, totalStats, weaponDamage } from "../systems/stats.js";

const SLOT_GLYPHS = { helmet: "H", chest: "C", legs: "L", gloves: "G", boots: "B", sword: "Sw", bow: "Bo", staff: "St" };
const POTION_GLYPHS = { hp: "♥", mana: "◆", travel: "✦" };
const TOOL_GLYPHS = { axe: "Ax", pickaxe: "Pk" };

/**
 * Icon markup for an item. `instance` may be a { defId, qty, enchants } instance or a bare defId;
 * `attrs` adds data attributes for click handling. Potions show their level; enchanted gear a rune count.
 */
export function itemIcon(instance, qty = 1, attrs = "") {
  const defId = typeof instance === "string" ? instance : instance.defId;
  const def = ITEMS[defId];
  const glyph = def.slot ? SLOT_GLYPHS[def.slot] : def.potion ? POTION_GLYPHS[def.potion] : TOOL_GLYPHS[def.tool] ?? "?";
  const classes = ["item-icon", `type-${def.type}`];
  if (def.tier) classes.push(`tier-${def.tier}`);
  if (def.potion) classes.push(`res-${def.potion}`);
  const runes = typeof instance === "string" ? 0 : runeCount(instance);
  if (runes) classes.push("enchanted");
  return `<div class="${classes.join(" ")}" data-item="${defId}" ${runes ? enchantAttr(instance) : ""} ${attrs}>
    <span class="glyph">${glyph}</span>${qty > 1 ? `<span class="qty">${qty}</span>` : ""}${def.potion ? `<span class="lvl">${def.level}</span>` : ""}${runes ? `<span class="runes">${"•".repeat(Math.min(runes, 5))}</span>` : ""}
  </div>`;
}

/**
 * A grid of slots; empty slots render as blanks. `attrsFor(i)` supplies per-item data
 * attributes, `emptyAttrsFor(i)` the same for empty slots (e.g. drop targets), and
 * `gridAttrs` goes on the grid itself.
 */
export function slotGrid(slots, attrsFor, gridAttrs = "", emptyAttrsFor = () => "") {
  return `<div class="slot-grid" ${gridAttrs}>${slots
    .map((slot, i) => (slot ? itemIcon(slot, slot.qty, attrsFor(i)) : `<div class="item-icon empty" ${emptyAttrsFor(i)}></div>`))
    .join("")}</div>`;
}

/**
 * Tooltip text lines for an item, comparing armor or weapon bonus against what the player has
 * equipped. `enchants` lists the runes on that particular piece.
 */
export function describeItem(defId, player, { price, enchants } = {}) {
  const def = ITEMS[defId];
  const lines = [`<strong class="tier-text-${def.tier ?? def.type}">${def.name}</strong>`];
  if (def.type === "armor") {
    lines.push(`<span class="dim">Armor · ${SLOT_NAMES[def.slot]} slot</span>`);
    lines.push(`Armor ${def.armor}${compareTo(def, player, "armor")}`);
  } else if (def.type === "weapon") {
    const weapon = WEAPONS[def.slot];
    lines.push(`<span class="dim">Weapon · ${SLOT_NAMES[def.slot]} slot</span>`);
    lines.push(`Damage ${weapon.stat.toUpperCase()} × ${weapon.multiplier} + ${def.weaponBonus}${compareTo(def, player, "weaponBonus")}`);
    lines.push(`<span class="dim">Now ${weaponDamage(weapon, totalStats(player), { defId })} per hit</span>`);
  } else if (def.type === "tool") {
    lines.push(`<span class="dim">Tool · keep it in your bag</span>`);
    lines.push(def.tool === "axe" ? "Hold F next to a tree to chop wood" : "Hold F next to a rock to mine stone");
  } else if (def.potion === "travel") {
    lines.push(`Teleports you to the village, or to a dungeon you've visited of level ${def.level} or lower`);
  } else {
    lines.push(`Restores ${def.amount} ${def.resource === "hp" ? "HP" : "mana"}`);
  }
  const runeLines = Object.entries(enchants ?? {}).filter(([, n]) => n > 0);
  if (runeLines.length) lines.push(`<span class="rune-text">Runes: ${runeLines.map(([stat, n]) => `+${n * RUNE_BONUS} ${stat.toUpperCase()}`).join(", ")}</span>`);
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

/**
 * Floating tooltip shown while hovering any [data-item] element. Its [data-enchants] (JSON)
 * lists the runes on that piece.
 */
export class Tooltip {
  constructor(element, game) {
    this.element = element;
    this.game = game;
    document.addEventListener("mouseover", (e) => {
      const target = e.target.closest("[data-item]");
      if (!target || !this.game()) {
        this.hide();
        return;
      }
      const price = target.dataset.price === undefined ? undefined : Number(target.dataset.price);
      const { enchants } = target.dataset;
      const hint = target.dataset.hint ? `<br><span class="hint">${target.dataset.hint}</span>` : "";
      this.element.innerHTML = describeItem(target.dataset.item, this.game().player, { price, enchants: enchants ? JSON.parse(enchants) : null }) + hint;
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

// Carries a gear piece's runes to the tooltip.
function enchantAttr(instance) {
  return `data-enchants='${JSON.stringify(instance.enchants)}'`;
}
