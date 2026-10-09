import { serializeGame } from "../save.js";
import * as dev from "../systems/dev.js";

/** Whether the dev panel is offered: always when running locally, or with ?dev in the URL. */
export function devPanelEnabled(location) {
  const local = ["localhost", "127.0.0.1", "[::1]", ""].includes(location.hostname);
  return local || new URLSearchParams(location.search).has("dev");
}

/**
 * Developer panel (` key): cheats for playtesting. It floats beside the HUD and doesn't
 * pause the game, so you can watch the effect of what you click.
 */
export class DevPanel {
  constructor(element, getGame) {
    this.element = element;
    this.getGame = getGame;
    this.status = "";
    this.saveJson = null;
    element.addEventListener("click", (e) => {
      const button = e.target.closest("button[data-dev]");
      if (button) this.run(button.dataset.dev);
    });
  }

  get isOpen() {
    return !this.element.hidden;
  }

  toggle() {
    this.element.hidden = !this.element.hidden;
    if (this.isOpen) this.render();
  }

  hide() {
    this.element.hidden = true;
  }

  run(action) {
    const game = this.getGame();
    if (!game) return;
    switch (action) {
      case "gold":
        dev.addGold(game, 500);
        this.status = "+500 gold";
        break;
      case "xp":
        dev.addXp(game, 100);
        this.status = "+100 XP";
        break;
      case "level":
        dev.levelUp(game);
        this.status = `Now level ${game.player.level}`;
        break;
      case "village":
        dev.teleportToVillage(game);
        this.status = "Teleported to the village";
        break;
      case "dungeon":
        this.status = dev.teleportToNearestDungeon(game) ? "Teleported to the nearest dungeon" : "No dungeon found";
        break;
      case "grave":
        this.status = dev.teleportToGrave(game) ? "Teleported to your grave" : "No grave";
        break;
      case "god":
        this.status = `God mode ${dev.toggleGodMode(game) ? "on" : "off"}`;
        break;
      case "hitboxes":
        this.status = `Hitboxes ${dev.toggleHitboxes(game) ? "on" : "off"}`;
        break;
      case "reveal":
        dev.revealMap(game);
        this.status = "Map revealed";
        break;
      case "kill":
        this.status = `Killed ${dev.killNearby(game)} enemies`;
        break;
      case "deeper": {
        const level = dev.teleportToDeeperDungeon(game);
        this.status = level ? `Teleported to a level ${level} dungeon` : "No deeper dungeon found";
        break;
      }
      case "materials":
        dev.addMaterials(game);
        this.status = "+100 wood and stone, +20 of each goop";
        break;
      case "runes":
        dev.addRunes(game);
        this.status = "+5 of every rune";
        break;
      case "tools":
        this.status = dev.addTools(game) ? "Axe and pickaxe added" : "You already have both (or your bag is full)";
        break;
      case "save":
        this.saveJson = JSON.stringify(serializeGame(game), null, 2);
        console.log("Save JSON", JSON.parse(this.saveJson));
        this.status = "Save JSON below (also logged to the console)";
        break;
      case "close":
        this.hide();
        return;
    }
    this.render();
  }

  render() {
    const game = this.getGame();
    const on = (flag) => (game?.[flag] ? " on" : "");
    this.element.innerHTML = `
      <div class="dev-header"><strong>Dev panel</strong> <span class="dim">(\` to close · game keeps running)</span></div>
      <div class="dev-grid">
        <button class="btn small" data-dev="gold">+500 gold</button>
        <button class="btn small" data-dev="xp">+100 XP</button>
        <button class="btn small" data-dev="level">Level up</button>
        <button class="btn small" data-dev="village">To village</button>
        <button class="btn small" data-dev="dungeon">To nearest dungeon</button>
        <button class="btn small" data-dev="deeper">To deeper dungeon</button>
        <button class="btn small" data-dev="grave">To grave</button>
        <button class="btn small toggle${on("godMode")}" data-dev="god">God mode</button>
        <button class="btn small toggle${on("showHitboxes")}" data-dev="hitboxes">Hitboxes</button>
        <button class="btn small" data-dev="reveal">Reveal map</button>
        <button class="btn small" data-dev="kill">Kill nearby</button>
        <button class="btn small" data-dev="materials">+Materials</button>
        <button class="btn small" data-dev="runes">+Runes</button>
        <button class="btn small" data-dev="tools">Axe + pickaxe</button>
        <button class="btn small" data-dev="save">Print save JSON</button>
        <button class="btn small" data-dev="close">Close</button>
      </div>
      ${this.status ? `<p class="gain small">${this.status}</p>` : ""}
      ${this.saveJson ? `<textarea class="export-code" rows="6" readonly>${this.saveJson}</textarea>` : ""}`;
  }
}
