import { RUNE_BONUS, RUNE_CONVERT_RATIO } from "../config.js";
import { RUNES, RUNE_TYPES } from "../data/enemies.js";
import { EQUIP_SLOTS, ITEMS, SLOT_NAMES } from "../data/items.js";
import { structureCost } from "../data/structures.js";
import { convertCost, enchantCost, isEnchantable } from "../systems/enchanting.js";
import { runeCount } from "../systems/stats.js";
import { costLabel } from "./build.js";
import { itemIcon } from "./items.js";
import { Panel } from "./panel.js";

/**
 * Enchanting Table: pick a gear piece (equipped or in the bag) and apply runes to it for gold.
 * A table of level N holds N runes per piece. Also converts runes 4 → 1, upgrades the table,
 * and moves it (callbacks.onPlace).
 */
export class EnchantingPanel extends Panel {
  constructor(...args) {
    super(...args);
    this.wide = true;
  }

  onOpen() {
    this.selected = { where: "equip", key: "sword" };
    this.convert = { from: RUNE_TYPES[0], to: RUNE_TYPES[1] };
  }

  onAction(action, data) {
    const { game } = this;
    if (action === "select") this.selected = { where: data.where, key: data.key };
    else if (action === "apply") game.applyRune(this.selected, data.stat);
    else if (action === "convert") {
      this.convert = { from: this.element.querySelector("#convert-from").value, to: this.element.querySelector("#convert-to").value };
      game.convertRunes(this.convert.from, this.convert.to);
    } else if (action === "upgrade") game.upgradeStructure("enchantingTable");
    else if (action === "move") {
      this.callbacks.onPlace("enchantingTable");
      return false;
    } else if (action === "close") {
      this.callbacks.onClose();
      return false;
    }
  }

  render() {
    const { game } = this;
    const { player } = game;
    const table = game.structure("enchantingTable");
    const cost = enchantCost(player.level);

    const pieces = [
      ...EQUIP_SLOTS.filter((slot) => player.equipment[slot]).map((slot) => ({ where: "equip", key: slot, instance: player.equipment[slot], label: `Equipped · ${SLOT_NAMES[slot]}` })),
      ...player.inventory.map((instance, i) => ({ where: "bag", key: String(i), instance, label: "In bag" })).filter((p) => isEnchantable(p.instance)),
    ];
    const isSelected = (p) => p.where === this.selected.where && p.key === this.selected.key;
    if (!pieces.some(isSelected) && pieces.length) this.selected = { where: pieces[0].where, key: pieces[0].key };

    const gearRows = pieces
      .map((p) => {
        const runes = runeCount(p.instance);
        const bonus = Object.entries(p.instance.enchants ?? {})
          .filter(([, n]) => n)
          .map(([stat, n]) => `+${n * RUNE_BONUS} ${stat.toUpperCase()}`)
          .join(", ");
        return `<button class="gear-row ${isSelected(p) ? "selected" : ""}" data-action="select" data-where="${p.where}" data-key="${p.key}">
          ${itemIcon(p.instance)}<span class="name">${ITEMS[p.instance.defId].name}<br><span class="dim small">${p.label}</span></span>
          <span class="small ${runes >= table.level ? "dim" : ""}">${runes}/${table.level} runes${bonus ? `<br><span class="rune-text">${bonus}</span>` : ""}</span>
        </button>`;
      })
      .join("");

    const piece = game.gearAt(this.selected);
    const full = piece && runeCount(piece) >= table.level;
    const applyButtons = RUNE_TYPES.map((stat) => {
      const have = player.runes[stat];
      const ok = piece && have > 0 && !full && player.gold >= cost;
      return `<button class="btn small" data-action="apply" data-stat="${stat}" ${ok ? "" : "disabled"}>+${RUNE_BONUS} ${stat.toUpperCase()} <span class="dim">(${RUNES[stat].name} ×${have})</span></button>`;
    }).join("");

    const options = RUNE_TYPES.map((stat) => `<option value="${stat}">${RUNES[stat].name} (${stat.toUpperCase()}) ×${player.runes[stat]}</option>`).join("");
    const nextCost = structureCost("enchantingTable", table.level + 1);
    const canUpgrade = Object.keys(game.missingMaterials("enchantingTable", table.level + 1)).length === 0;

    this.element.innerHTML = `
      <h2>Enchanting Table <span class="dim">Level ${table.level} · ${player.gold} g</span></h2>
      <p class="dim small">Each rune adds +${RUNE_BONUS} to one stat while the gear is equipped. This table holds ${table.level} rune${table.level > 1 ? "s" : ""} per piece.
        Applying one costs ${cost} g (75 × your level). Runes can't be taken back off. Enchanted gear drops into your grave when you die, starter weapons included.</p>
      <div class="enchant-layout">
        <div class="gear-list">${gearRows || `<p class="dim">No armor or weapons to enchant.</p>`}</div>
        <div>
          <h3>${piece ? ITEMS[piece.defId].name : "Pick a piece"}</h3>
          <div class="rune-buttons">${applyButtons}</div>
          ${full ? `<p class="dim small">This piece is full. Upgrade the table to hold more runes per piece.</p>` : ""}
          <h3>Convert runes</h3>
          <div class="slot-actions">
            <select id="convert-from">${options}</select> → <select id="convert-to">${options}</select>
          </div>
          <div class="slot-actions">
            <button class="btn small" data-action="convert">Convert ${RUNE_CONVERT_RATIO} → 1 (${convertCost(player.level)} g)</button>
          </div>
          <h3>Upgrade</h3>
          <p class="small">Level ${table.level + 1} (${table.level + 1} runes per piece): ${costLabel(nextCost, player.materials)}</p>
          <div class="slot-actions">
            <button class="btn small" data-action="upgrade" ${canUpgrade ? "" : "disabled"}>Upgrade table</button>
            <button class="btn small" data-action="move">Move table</button>
          </div>
        </div>
      </div>
      <div class="actions"><button class="btn" data-action="close">Close (Esc)</button></div>`;
    this.element.querySelector("#convert-from").value = this.convert.from;
    this.element.querySelector("#convert-to").value = this.convert.to;
  }
}
