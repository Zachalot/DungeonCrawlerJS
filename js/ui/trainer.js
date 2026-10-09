import { STAT_POINTS_PER_LEVEL } from "../config.js";
import { respecCost } from "../systems/leveling.js";

/** Respec Trainer dialog: reset all spent stat points for gold. */
export class TrainerDialog {
  constructor(element, game, { onClose, onRespec }) {
    this.element = element;
    this.game = game;
    this.onClose = onClose;
    this.onRespec = onRespec;
    this.handleClick = (e) => this.onClick(e);
  }

  open() {
    this.element.addEventListener("click", this.handleClick);
    this.render();
  }

  close() {
    this.element.removeEventListener("click", this.handleClick);
  }

  onClick(e) {
    const action = e.target.closest("button[data-action]")?.dataset.action;
    if (action === "respec" && this.game.buyRespec()) this.onRespec();
    else if (action === "close") this.onClose();
  }

  render() {
    const { player } = this.game;
    const cost = respecCost(player.level);
    const refund = (player.level - 1) * STAT_POINTS_PER_LEVEL;
    const spent = refund - player.unspentPoints;
    const canAfford = player.gold >= cost;
    const reason = spent === 0 ? "You have no spent points to reset." : canAfford ? "" : `You need ${cost - player.gold} more gold.`;

    this.element.innerHTML = `
      <h2>Respec Trainer</h2>
      <p>"Regret your choices? For <strong>${cost} g</strong> I'll reset your stats, and you can spend all
      <strong>${refund}</strong> of your points again."</p>
      <p class="dim">The cost is 50 g × your level. You have ${player.gold} g.</p>
      ${reason ? `<p class="warning-text">${reason}</p>` : ""}
      <div class="actions">
        <button class="btn primary" data-action="respec" ${spent > 0 && canAfford ? "" : "disabled"}>Reset stats (${cost} g)</button>
        <button class="btn" data-action="close">Leave (Esc)</button>
      </div>`;
  }
}
