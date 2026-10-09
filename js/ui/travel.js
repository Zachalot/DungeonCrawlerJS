import { ITEMS } from "../data/items.js";
import { Panel } from "./panel.js";

/**
 * Travel menu for a travel potion (`options.defId`): the village, or any dungeon you've visited
 * of the potion's level or lower. Picking one drinks the potion and teleports you.
 */
export class TravelPanel extends Panel {
  onAction(action, { destination }) {
    if (action === "go") {
      if (this.game.travel(this.options.defId, destination)) {
        this.callbacks.onClose();
        return false;
      }
    } else if (action === "close") {
      this.callbacks.onClose();
      return false;
    }
  }

  render() {
    const def = ITEMS[this.options.defId];
    const destinations = this.game.travelDestinations(def.level);
    const rows = destinations
      .map((d) => `<div class="shop-row"><span class="glyph">${d.id === "village" ? "⌂" : "▣"}</span><span class="name">${d.name}</span><span></span>
        <button class="btn small" data-action="go" data-destination="${d.id}">Go</button></div>`)
      .join("");
    this.element.innerHTML = `
      <h2>${def.name}</h2>
      <p class="dim small">Where to? Dungeons you've visited of level ${def.level} or lower are listed; you arrive at the entrance.</p>
      <div class="shop-list">${rows}</div>
      ${destinations.length === 1 ? `<p class="dim small">Visit dungeons to add them here.</p>` : ""}
      <div class="actions"><button class="btn" data-action="close">Cancel (Esc)</button></div>`;
  }
}
