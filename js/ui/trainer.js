import { STAT_POINTS_PER_LEVEL } from "../config.js";
import { respecCost } from "../systems/leveling.js";
import { Panel } from "./panel.js";

/** Respec Trainer dialog: reset all spent stat points for gold. */
export class TrainerDialog extends Panel {
  onAction(action) {
    if (action === "respec" && this.game.buyRespec()) {
      this.callbacks.onRespec();
      return false;
    }
    if (action === "close") {
      this.callbacks.onClose();
      return false;
    }
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
