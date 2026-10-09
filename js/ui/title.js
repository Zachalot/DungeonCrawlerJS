import { SLOT_COUNT, importSave } from "../save.js";

/**
 * Title screen: pick a save slot to continue, start a new game (optional seed),
 * delete a slot (with confirmation), or import a save code into a slot.
 */
export class TitleScreen {
  constructor(element, store, { onContinue, onNewGame, onImport, defaultSeed }) {
    this.element = element;
    this.store = store;
    this.onContinue = onContinue;
    this.onNewGame = onNewGame;
    this.onImport = onImport;
    this.defaultSeed = defaultSeed;
    this.confirmDelete = null;
    this.message = "";
    element.addEventListener("click", (e) => this.onClick(e));
  }

  show() {
    this.confirmDelete = null;
    this.message = "";
    this.element.hidden = false;
    this.render();
  }

  hide() {
    this.element.hidden = true;
  }

  onClick(e) {
    const button = e.target.closest("button[data-action]");
    if (!button) return;
    const slot = Number(button.dataset.slot);
    switch (button.dataset.action) {
      case "continue":
        this.onContinue(slot);
        return;
      case "new": {
        const raw = this.element.querySelector(`#seed-${slot}`).value.trim();
        const seed = raw === "" ? null : Number.parseInt(raw, 10);
        if (raw !== "" && !Number.isFinite(seed)) {
          this.message = "The seed must be a whole number (or blank for a random world).";
          break;
        }
        this.onNewGame(slot, seed === null ? null : seed >>> 0);
        return;
      }
      case "delete":
        if (this.confirmDelete === slot) {
          this.store.delete(slot);
          this.confirmDelete = null;
          this.message = `Slot ${slot} deleted.`;
        } else {
          this.confirmDelete = slot;
        }
        break;
      case "import": {
        const code = this.element.querySelector("#import-code").value;
        const target = Number(this.element.querySelector("#import-slot").value);
        try {
          this.onImport(target, importSave(code));
          return;
        } catch (error) {
          this.message = error.message;
        }
        break;
      }
    }
    this.render();
  }

  render() {
    const slots = this.store
      .list()
      .map(({ slot, summary }) => {
        if (!summary) {
          return `<div class="slot-card empty-slot">
            <h3>Slot ${slot} <span class="dim">· empty</span></h3>
            <label class="dim small">Seed <input id="seed-${slot}" class="seed-input" placeholder="random" value="${this.defaultSeed ?? ""}" /></label>
            <button class="btn primary" data-action="new" data-slot="${slot}">New game</button>
          </div>`;
        }
        if (summary.error) {
          return `<div class="slot-card">
            <h3>Slot ${slot} <span class="warning-text">· unreadable</span></h3>
            <p class="dim small">${summary.error}</p>
            <button class="btn" data-action="delete" data-slot="${slot}">${this.confirmDelete === slot ? "Really delete?" : "Delete"}</button>
          </div>`;
        }
        return `<div class="slot-card">
          <h3>Slot ${slot} <span class="dim">· Level ${summary.level}</span></h3>
          <p class="dim small">${formatDuration(summary.playTime)} played · saved ${formatAgo(summary.savedAt)} · seed ${summary.seed}</p>
          <div class="slot-actions">
            <button class="btn primary" data-action="continue" data-slot="${slot}">Continue</button>
            <button class="btn ${this.confirmDelete === slot ? "danger" : ""}" data-action="delete" data-slot="${slot}">${this.confirmDelete === slot ? "Really delete?" : "Delete"}</button>
          </div>
        </div>`;
      })
      .join("");

    const slotOptions = Array.from({ length: SLOT_COUNT }, (_, i) => `<option value="${i + 1}">Slot ${i + 1}</option>`).join("");
    this.element.innerHTML = `
      <div class="title-inner">
        <h1>Dungeon Crawler</h1>
        <p class="dim">Saves live in this browser only. Use Export in the pause menu (Esc) to move a save elsewhere.</p>
        ${this.message ? `<p class="warning-text">${this.message}</p>` : ""}
        <div class="slots">${slots}</div>
        <details class="import">
          <summary>Import a save code</summary>
          <textarea id="import-code" rows="3" placeholder="Paste a save code"></textarea>
          <div class="slot-actions">
            <select id="import-slot">${slotOptions}</select>
            <button class="btn" data-action="import">Import (overwrites that slot)</button>
          </div>
        </details>
      </div>`;
  }
}

export function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function formatAgo(iso) {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}
