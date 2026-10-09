import { slotGrid } from "./items.js";
import { Panel } from "./panel.js";

/**
 * Village stash: items and gold here are never lost on death. Move a stack by clicking
 * it or dragging it to the other grid; items and gold have separate "all" buttons.
 */
export class StashPanel extends Panel {
  constructor(...args) {
    super(...args);
    this.wide = true;
    this.dragged = null; // { from: "bag" | "stash", index }
    this.handleDragStart = (e) => this.onDragStart(e);
    this.handleDragOver = (e) => this.onDragOver(e);
    this.handleDrop = (e) => this.onDrop(e);
    this.handleDragEnd = () => this.onDragEnd();
  }

  open() {
    for (const [type, handler] of this.dragHandlers()) this.element.addEventListener(type, handler);
    super.open();
  }

  close() {
    for (const [type, handler] of this.dragHandlers()) this.element.removeEventListener(type, handler);
    super.close();
  }

  dragHandlers() {
    return [
      ["dragstart", this.handleDragStart],
      ["dragover", this.handleDragOver],
      ["drop", this.handleDrop],
      ["dragend", this.handleDragEnd],
    ];
  }

  onAction(action, { index, amount }) {
    const { game } = this;
    const value = amount === "all" ? Infinity : Number(amount);
    if (action === "deposit") game.stashDeposit(Number(index));
    else if (action === "withdraw") game.stashWithdraw(Number(index));
    else if (action === "depositAllItems") game.stashDepositAll();
    else if (action === "withdrawAllItems") game.stashWithdrawAll();
    else if (action === "depositGold") game.depositGold(value);
    else if (action === "withdrawGold") game.withdrawGold(value);
    else if (action === "close") {
      this.callbacks.onClose();
      return false;
    }
  }

  onDragStart(e) {
    const item = e.target.closest("[data-drag-from]");
    if (!item) return;
    this.dragged = { from: item.dataset.dragFrom, index: Number(item.dataset.index) };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.dataset.item); // required by Firefox to start a drag
  }

  // Only the opposite grid accepts the drop; highlight it while hovering.
  onDragOver(e) {
    const zone = e.target.closest("[data-drop-zone]");
    const ok = this.dragged && zone && zone.dataset.dropZone !== this.dragged.from;
    if (!ok) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    for (const z of this.element.querySelectorAll("[data-drop-zone]")) z.classList.toggle("drop-target", z === zone);
  }

  onDrop(e) {
    const zone = e.target.closest("[data-drop-zone]");
    if (!this.dragged || !zone || zone.dataset.dropZone === this.dragged.from) return;
    e.preventDefault();
    const { from, index } = this.dragged;
    if (from === "bag") this.game.stashDeposit(index);
    else this.game.stashWithdraw(index);
    this.dragged = null;
    this.render();
  }

  onDragEnd() {
    this.dragged = null;
    for (const z of this.element.querySelectorAll("[data-drop-zone]")) z.classList.remove("drop-target");
  }

  render() {
    const { player, stash } = this.game;
    const bagItems = player.inventory.some(Boolean);
    const stashItems = stash.items.some(Boolean);
    const itemAttrs = (from, action, hint) => (i) =>
      `data-action="${action}" data-index="${i}" data-drag-from="${from}" draggable="true" data-hint="${hint}"`;

    this.element.innerHTML = `
      <h2>Stash <span class="dim">safe from death</span></h2>
      <div class="stash-layout">
        <div class="stash-side">
          <h3>Your bag <span class="dim">${player.gold} g</span></h3>
          ${slotGrid(player.inventory, itemAttrs("bag", "deposit", "Click or drag to deposit"), `data-drop-zone="bag"`)}
          <div class="gold-buttons">
            <button class="btn small" data-action="depositAllItems" ${bagItems ? "" : "disabled"}>Deposit all items</button>
            <button class="btn small" data-action="depositGold" data-amount="all" ${player.gold ? "" : "disabled"}>Deposit all gold</button>
          </div>
        </div>
        <div class="stash-side">
          <h3>Stash <span class="dim">${stash.gold} g</span></h3>
          ${slotGrid(stash.items, itemAttrs("stash", "withdraw", "Click or drag to withdraw"), `data-drop-zone="stash"`)}
          <div class="gold-buttons">
            <button class="btn small" data-action="withdrawAllItems" ${stashItems ? "" : "disabled"}>Withdraw all items</button>
            <button class="btn small" data-action="withdrawGold" data-amount="all" ${stash.gold ? "" : "disabled"}>Withdraw all gold</button>
          </div>
        </div>
      </div>
      <p class="dim small">Click a stack or drag it to the other side. Equipped armor stays on you: take it off in your inventory (I) first to store it.</p>
      <div class="actions"><button class="btn" data-action="close">Close (Esc)</button></div>`;
  }
}
