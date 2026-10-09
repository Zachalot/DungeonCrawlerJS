import { exportSave, serializeGame } from "../save.js";
import { escapeHtml } from "./html.js";
import { formatDuration } from "./title.js";
import { Panel } from "./panel.js";

const SYNC_TEXT = {
  synced: "progress is saved to your account",
  pending: "syncing to your account…",
  offline: "can't reach the cloud right now; progress is saved on this device and will sync later",
  conflict: "this slot was also saved on another device; choose which copy to keep on the title screen",
};

/**
 * Pause menu (Esc): resume, save now, export a save code, quit to the title screen, or sign out.
 * `callbacks.account()` returns { name, status } while signed in, or null.
 */
export class PauseMenu extends Panel {
  onOpen() {
    this.code = null;
    this.status = "";
  }

  onAction(action) {
    const { callbacks } = this;
    if (action === "resume") {
      callbacks.onClose();
      return false;
    }
    if (action === "save") {
      callbacks.onSave();
      this.status = `Saved to slot ${callbacks.slot()}.`;
    } else if (action === "export") {
      this.code = exportSave(serializeGame(this.game));
      this.status = "";
    } else if (action === "copy") {
      navigator.clipboard?.writeText(this.code).then(
        () => this.setStatus("Copied to clipboard."),
        () => this.setStatus("Couldn't copy. Select the text and copy it manually."),
      );
      return false;
    } else if (action === "quit") {
      callbacks.onQuit();
      return false;
    } else if (action === "sign-out") {
      callbacks.onSignOut();
      return false;
    }
  }

  setStatus(text) {
    this.status = text;
    this.render();
  }

  render() {
    const { game } = this;
    const account = this.callbacks.account();
    this.element.innerHTML = `
      <h2>Paused</h2>
      <p class="dim">Slot ${this.callbacks.slot()} · Level ${game.player.level} · ${formatDuration(game.playTime)} played · seed ${game.world.seed}</p>
      <p class="dim small">${
        account
          ? `Signed in as <strong>${escapeHtml(account.name)}</strong>: ${SYNC_TEXT[account.status]}.`
          : "Playing without an account: saves stay in this browser."
      }</p>
      <p class="dim small">The game autosaves every minute, when you enter the village or a dungeon, open a chest, recover a grave, die, or close the tab.</p>
      ${this.status ? `<p class="gain">${this.status}</p>` : ""}
      ${
        this.code
          ? `<label class="dim small">Save code: paste it on the title screen of any browser to import.</label>
             <textarea class="export-code" rows="4" readonly>${this.code}</textarea>
             <div class="actions"><button class="btn" data-action="copy">Copy</button></div>`
          : ""
      }
      <div class="actions">
        <button class="btn" data-action="export">Export save</button>
        <button class="btn" data-action="save">Save now</button>
        <button class="btn" data-action="quit">Save &amp; quit to title</button>
        ${account ? `<button class="btn" data-action="sign-out">Save &amp; sign out</button>` : ""}
        <button class="btn primary" data-action="resume">Resume (Esc)</button>
      </div>`;
  }
}
