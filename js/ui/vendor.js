import { ITEMS } from "../data/items.js";
import { VENDORS } from "../data/vendors.js";
import { describeEntry } from "../systems/economy.js";
import { itemIcon, slotGrid } from "./items.js";
import { Panel } from "./panel.js";

/** Vendor dialog with Buy, and for vendors that buy, Sell and Buyback tabs. */
export class VendorDialog extends Panel {
  constructor(element, getGame, callbacks, vendorId) {
    super(element, getGame, callbacks);
    this.vendorId = vendorId;
    this.vendor = VENDORS[vendorId];
    this.wide = true;
  }

  onOpen() {
    this.tab = "buy";
  }

  onAction(action, { index, tab }) {
    const { game } = this;
    if (action === "tab") this.tab = tab;
    else if (action === "buy") game.buy(this.vendorId, Number(index));
    else if (action === "sell") game.sell(Number(index));
    else if (action === "buyback") game.buyBack(Number(index));
    else if (action === "close") {
      this.callbacks.onClose();
      return false;
    }
  }

  render() {
    const { player } = this.game;
    const tabs = this.vendor.buys ? ["buy", "sell", "buyback"] : ["buy"];
    const tabButtons =
      tabs.length > 1
        ? `<div class="tabs">${tabs
            .map((t) => `<button class="tab ${t === this.tab ? "active" : ""}" data-action="tab" data-tab="${t}">${TAB_NAMES[t]}</button>`)
            .join("")}</div>`
        : "";

    this.element.innerHTML = `
      <h2>${this.vendor.name} <span class="dim">You have ${player.gold} g</span></h2>
      <p class="dim">"${this.vendor.greeting}"</p>
      ${tabButtons}
      <div class="tab-body">${this.renderTab(player)}</div>
      <div class="actions"><button class="btn" data-action="close">Leave (Esc)</button></div>`;
  }

  renderTab(player) {
    if (this.tab === "sell") {
      return `${slotGrid(player.inventory, (i) => {
        const def = ITEMS[player.inventory[i].defId];
        return `data-action="sell" data-index="${i}" data-price="${def.sellPrice}"`;
      })}<p class="dim small">Click an item to sell one for half its price.</p>`;
    }
    if (this.tab === "buyback") {
      if (this.game.buyback.length === 0) return `<p class="dim">Nothing sold yet. Items you sell show up here.</p>`;
      return `<div class="shop-list">${this.game.buyback
        .map((entry, i) => shopRow(itemIcon(entry.defId, 1, `data-price="${entry.price}"`), ITEMS[entry.defId].name, entry.price, player.gold, `data-action="buyback" data-index="${i}"`))
        .join("")}</div>`;
    }
    return `<div class="shop-list">${this.vendor.stock
      .map((entry, i) => {
        const { name, price } = describeEntry(entry);
        const icon = entry.arrows ? `<div class="item-icon type-ammo"><span class="glyph">➶</span></div>` : itemIcon(entry.item, 1, `data-price="${price}"`);
        return shopRow(icon, name, price, player.gold, `data-action="buy" data-index="${i}"`);
      })
      .join("")}</div>`;
  }
}

const TAB_NAMES = { buy: "Buy", sell: "Sell", buyback: "Buyback" };

function shopRow(icon, name, price, gold, attrs) {
  return `<div class="shop-row">${icon}<span class="name">${name}</span><span class="gold-text">${price} g</span>
    <button class="btn small" ${attrs} ${gold < price ? "disabled" : ""}>Buy</button></div>`;
}
