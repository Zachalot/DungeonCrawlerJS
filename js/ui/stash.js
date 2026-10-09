import { DragDrop, parseDragId } from "./dragDrop.js";
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
    this.dragDrop = new DragDrop(this.element, {
      // Stacks only move across, from one side's grid to the other's.
      classify: (source, target) => (parseDragId(source)[0] !== target ? "valid" : null),
      onDrop: (source) => {
        const [from, index] = parseDragId(source);
        if (from === "bag") this.game.stashDeposit(Number(index));
        else this.game.stashWithdraw(Number(index));
        this.render();
      },
    });
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

  render() {
    const { player, stash } = this.game;
    const bagItems = player.inventory.some(Boolean);
    const stashItems = stash.items.some(Boolean);
    const itemAttrs = (from, action, hint) => (i) =>
      `data-action="${action}" data-index="${i}" data-drag="${from}:${i}" draggable="true" data-hint="${hint}"`;

    this.element.innerHTML = `
      <h2>Stash <span class="dim">safe from death</span></h2>
      <div class="stash-layout">
        <div class="stash-side">
          <h3>Your bag <span class="dim">${player.gold} g</span></h3>
          ${slotGrid(player.inventory, itemAttrs("bag", "deposit", "Click or drag to deposit"), `data-drop="bag"`)}
          <div class="gold-buttons">
            <button class="btn small" data-action="depositAllItems" ${bagItems ? "" : "disabled"}>Deposit all items</button>
            <button class="btn small" data-action="depositGold" data-amount="all" ${player.gold ? "" : "disabled"}>Deposit all gold</button>
          </div>
        </div>
        <div class="stash-side">
          <h3>Stash <span class="dim">${stash.gold} g</span></h3>
          ${slotGrid(stash.items, itemAttrs("stash", "withdraw", "Click or drag to withdraw"), `data-drop="stash"`)}
          <div class="gold-buttons">
            <button class="btn small" data-action="withdrawAllItems" ${stashItems ? "" : "disabled"}>Withdraw all items</button>
            <button class="btn small" data-action="withdrawGold" data-amount="all" ${stash.gold ? "" : "disabled"}>Withdraw all gold</button>
          </div>
        </div>
      </div>
      <p class="dim small">Click a stack or drag it to the other side. Equipped gear stays on you: take it off in your inventory (I) first to store it.</p>
      <div class="actions"><button class="btn" data-action="close">Close (Esc)</button></div>`;
  }
}
