import { slotGrid } from "./items.js";
import { Panel } from "./panel.js";

/** Village stash: items and gold here are never lost on death. Click a stack to move it across. */
export class StashPanel extends Panel {
  constructor(...args) {
    super(...args);
    this.wide = true;
  }

  onAction(action, { index, amount }) {
    const { game } = this;
    const value = amount === "all" ? Infinity : Number(amount);
    if (action === "deposit") game.stashDeposit(Number(index));
    else if (action === "withdraw") game.stashWithdraw(Number(index));
    else if (action === "depositGold") game.depositGold(value);
    else if (action === "withdrawGold") game.withdrawGold(value);
    else if (action === "close") {
      this.callbacks.onClose();
      return false;
    }
  }

  render() {
    const { player, stash } = this.game;
    this.element.innerHTML = `
      <h2>Stash <span class="dim">safe from death</span></h2>
      <div class="stash-layout">
        <div>
          <h3>Your bag <span class="dim">${player.gold} g</span></h3>
          ${slotGrid(player.inventory, (i) => `data-action="deposit" data-index="${i}"`)}
          <div class="gold-buttons">
            <button class="btn small" data-action="depositGold" data-amount="10" ${player.gold ? "" : "disabled"}>Deposit 10 g</button>
            <button class="btn small" data-action="depositGold" data-amount="all" ${player.gold ? "" : "disabled"}>Deposit all</button>
          </div>
        </div>
        <div>
          <h3>Stash <span class="dim">${stash.gold} g</span></h3>
          ${slotGrid(stash.items, (i) => `data-action="withdraw" data-index="${i}"`)}
          <div class="gold-buttons">
            <button class="btn small" data-action="withdrawGold" data-amount="10" ${stash.gold ? "" : "disabled"}>Withdraw 10 g</button>
            <button class="btn small" data-action="withdrawGold" data-amount="all" ${stash.gold ? "" : "disabled"}>Withdraw all</button>
          </div>
        </div>
      </div>
      <p class="dim small">Click a stack to move it between your bag and the stash. Equipped armor stays on you; unequip it first to store it.</p>
      <div class="actions"><button class="btn" data-action="close">Close (Esc)</button></div>`;
  }
}
