import { MIN_PASSWORD_LENGTH } from "../cloud/auth.js";
import { SLOT_COUNT, exportSave, importSave } from "../save.js";
import { escapeHtml } from "./html.js";

const GUEST_IMPORT_HIDDEN_KEY = "dungeonCrawler.guestImportHidden.";

/**
 * Title screen. Signed out: sign in, create an account, reset a password, or play without
 * an account. Then the save slots: continue, start a new game (optional seed), delete (with
 * confirmation), import a save code, settle a slot saved on two devices, and copy saves made
 * without an account into the account.
 *
 * `getStore` and `getAuth` are functions because signing in or out swaps them. `getAuth()`
 * is null when accounts are unavailable, and the screen is then the guest slots only.
 */
export class TitleScreen {
  constructor(element, { getStore, getAuth, guestStore, onContinue, onNewGame, onImport, onSignOut, defaultSeed }) {
    this.element = element;
    this.getStore = getStore;
    this.getAuth = getAuth;
    this.guestStore = guestStore;
    this.onContinue = onContinue;
    this.onNewGame = onNewGame;
    this.onImport = onImport;
    this.onSignOut = onSignOut;
    this.defaultSeed = defaultSeed;
    this.view = "loading"; // loading | signIn | signUp | forgot | recovery | username | slots
    this.guest = false; // chose "Play without an account"
    this.busy = false; // an account request is in flight
    this.syncing = false;
    this.fields = {}; // typed values kept across re-renders (never passwords)
    this.cloudNote = ""; // why accounts are unavailable, if they are
    this.confirmDelete = null;
    this.message = "";
    this.notice = "";
    element.addEventListener("click", (e) => this.onClick(e));
    element.addEventListener("submit", (e) => this.onSubmit(e));
  }

  /** Shows the right screen for the current account state. */
  show({ notice = "" } = {}) {
    this.element.hidden = false;
    this.confirmDelete = null;
    this.message = "";
    this.notice = notice;
    const auth = this.getAuth();
    if (auth?.linkError) {
      this.message = auth.linkError;
      auth.linkError = null;
    }
    if (!auth) this.showSlots();
    else if (auth.recovering) this.setView("recovery");
    else if (auth.user) auth.needsUsername ? this.setView("username") : this.showSlots();
    else if (this.guest) this.showSlots();
    else this.setView("signIn");
  }

  showLoading() {
    this.element.hidden = false;
    this.setView("loading");
  }

  hide() {
    this.element.hidden = true;
  }

  setView(view) {
    this.view = view;
    this.render();
  }

  /** The slot list, after pulling the latest cloud saves when signed in. */
  async showSlots() {
    this.view = "slots";
    const store = this.getStore();
    if (!store.pullAll) {
      this.render();
      return;
    }
    this.syncing = true;
    this.render();
    await store.pullAll();
    this.syncing = false;
    if (this.view === "slots" && this.getStore() === store) this.render();
  }

  // ---- Input --------------------------------------------------------------

  onClick(e) {
    const button = e.target.closest("button[data-action]");
    if (!button || button.disabled) return;
    const slot = Number(button.dataset.slot);
    const store = this.getStore();
    this.message = "";
    switch (button.dataset.action) {
      case "view":
        this.notice = "";
        this.setView(button.dataset.view);
        return;
      case "guest":
        this.guest = true;
        this.showSlots();
        return;
      case "sign-in":
        this.guest = false;
        this.setView("signIn");
        return;
      case "sign-out":
        this.guest = false;
        this.run(() => this.onSignOut());
        return;
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
          store.delete(slot);
          this.confirmDelete = null;
          this.notice = `Slot ${slot} deleted.`;
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
      case "keep":
        this.run(async () => {
          await store.resolveConflict(slot, button.dataset.keep);
          this.notice = `Slot ${slot}: kept ${button.dataset.keep === "cloud" ? "the cloud copy" : "this device's copy"}.`;
        });
        return;
      case "copy-code": {
        const copies = store.conflictCopies(slot);
        const code = exportSave(copies[button.dataset.copy]);
        navigator.clipboard?.writeText(code).then(
          () => this.setNotice("Save code copied. Paste it into Import a save code any time to get that copy back."),
          () => this.setNotice("Couldn't copy to the clipboard."),
        );
        return;
      }
      case "guest-copy": {
        const target = Number(this.element.querySelector(`#guest-target-${slot}`).value);
        store.save(target, this.guestStore.load(slot));
        this.notice = `Copied to your account's slot ${target}.`;
        break;
      }
      case "guest-hide":
        localStorage.setItem(GUEST_IMPORT_HIDDEN_KEY + store.owner, "1");
        break;
    }
    this.render();
  }

  onSubmit(e) {
    const form = e.target.closest("form[data-form]");
    if (!form) return;
    e.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    for (const [name, value] of Object.entries(values)) {
      if (!name.includes("password")) this.fields[name] = value;
    }
    const auth = this.getAuth();
    const email = (values.email ?? "").trim();
    switch (form.dataset.form) {
      case "signIn":
        this.run(() => auth.signIn(email, values.password)); // the auth change listener moves on
        return;
      case "signUp":
        this.run(async () => {
          const { needsConfirmation } = await auth.signUp(email, values.password, values.username.trim());
          if (needsConfirmation) {
            this.view = "signIn";
            this.notice = `Almost done: we sent a confirmation link to ${email}. Click it, then sign in here.`;
          }
        });
        return;
      case "forgot":
        this.run(async () => {
          await auth.requestPasswordReset(email);
          this.view = "signIn";
          this.notice = `If an account exists for ${email}, we've sent a link to reset its password. Open it in this browser.`;
        });
        return;
      case "recovery":
        if (values.password !== values.password2) {
          this.setMessage("The two passwords don't match.");
          return;
        }
        this.run(async () => {
          await auth.setNewPassword(values.password);
          this.show({ notice: "Password changed. You're signed in." });
        });
        return;
      case "username":
        this.run(async () => {
          await auth.setUsername(values.username.trim());
          this.show();
        });
    }
  }

  /** Runs an account request with the buttons disabled; shows its error, if any. */
  async run(task) {
    this.busy = true;
    this.message = "";
    this.render();
    try {
      await task();
    } catch (error) {
      this.message = error.message;
    }
    this.busy = false;
    this.render();
  }

  setMessage(text) {
    this.message = text;
    this.render();
  }

  setNotice(text) {
    this.notice = text;
    this.render();
  }

  // ---- Rendering ----------------------------------------------------------

  render() {
    const body = {
      loading: () => `<p class="dim">Loading…</p>`,
      signIn: () => this.renderSignIn(),
      signUp: () => this.renderSignUp(),
      forgot: () => this.renderForgot(),
      recovery: () => this.renderRecovery(),
      username: () => this.renderUsername(),
      slots: () => this.renderSlots(),
    }[this.view]();
    this.element.innerHTML = `
      <div class="title-inner">
        <h1>Dungeon Crawler</h1>
        ${this.notice ? `<p class="gain">${escapeHtml(this.notice)}</p>` : ""}
        ${this.message ? `<p class="warning-text">${escapeHtml(this.message)}</p>` : ""}
        ${body}
      </div>`;
    this.element.querySelector("form input:not([value]), form input[value='']")?.focus();
  }

  field(name) {
    return escapeHtml(this.fields[name] ?? "");
  }

  submitButton(label) {
    return `<button class="btn primary" type="submit" ${this.busy ? "disabled" : ""}>${this.busy ? "Please wait…" : label}</button>`;
  }

  renderSignIn() {
    return `
      <p class="dim">Sign in to keep your progress in the cloud and pick it up from any browser.</p>
      <form class="auth-form panel" data-form="signIn">
        <label>Email <input type="email" name="email" autocomplete="email" required value="${this.field("email")}" /></label>
        <label>Password <input type="password" name="password" autocomplete="current-password" required /></label>
        <div class="slot-actions">${this.submitButton("Sign in")}</div>
      </form>
      <p class="auth-links">
        <button class="link" type="button" data-action="view" data-view="signUp">Create an account</button>
        · <button class="link" type="button" data-action="view" data-view="forgot">Forgot password?</button>
      </p>
      <div class="guest-choice">
        <button class="btn" type="button" data-action="guest">Play without an account</button>
        <span class="dim small">Saves stay in this browser only.</span>
      </div>`;
  }

  renderSignUp() {
    return `
      <p class="dim">Create an account to save your progress in the cloud.</p>
      <form class="auth-form panel" data-form="signUp">
        <label>Username <input name="username" autocomplete="username" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_]+" value="${this.field("username")}" /></label>
        <p class="dim small">3–20 letters, numbers, or underscores. Other players will see it.</p>
        <label>Email <input type="email" name="email" autocomplete="email" required value="${this.field("email")}" /></label>
        <label>Password <input type="password" name="password" autocomplete="new-password" required minlength="${MIN_PASSWORD_LENGTH}" /></label>
        <p class="dim small">At least ${MIN_PASSWORD_LENGTH} characters. If you forget it, you can reset it by email.</p>
        <div class="slot-actions">${this.submitButton("Create account")}</div>
      </form>
      <p class="auth-links"><button class="link" type="button" data-action="view" data-view="signIn">I already have an account</button></p>`;
  }

  renderForgot() {
    return `
      <p class="dim">Enter your account's email and we'll send you a link to choose a new password.</p>
      <form class="auth-form panel" data-form="forgot">
        <label>Email <input type="email" name="email" autocomplete="email" required value="${this.field("email")}" /></label>
        <div class="slot-actions">${this.submitButton("Send reset link")}</div>
      </form>
      <p class="auth-links"><button class="link" type="button" data-action="view" data-view="signIn">Back to sign in</button></p>`;
  }

  renderRecovery() {
    return `
      <p class="dim">Choose a new password for your account.</p>
      <form class="auth-form panel" data-form="recovery">
        <label>New password <input type="password" name="password" autocomplete="new-password" required minlength="${MIN_PASSWORD_LENGTH}" /></label>
        <label>Repeat it <input type="password" name="password2" autocomplete="new-password" required minlength="${MIN_PASSWORD_LENGTH}" /></label>
        <div class="slot-actions">${this.submitButton("Save new password")}</div>
      </form>`;
  }

  renderUsername() {
    return `
      <p class="dim">Pick a username for your account. Other players will see it.</p>
      <form class="auth-form panel" data-form="username">
        <label>Username <input name="username" autocomplete="username" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_]+" value="${this.field("username")}" /></label>
        <p class="dim small">3–20 letters, numbers, or underscores.</p>
        <div class="slot-actions">${this.submitButton("Continue")}</div>
      </form>
      <p class="auth-links"><button class="link" type="button" data-action="sign-out">Sign out</button></p>`;
  }

  renderSlots() {
    const store = this.getStore();
    const slots = store
      .list()
      .map(({ slot, summary }) => this.renderSlot(slot, summary))
      .join("");
    const slotOptions = Array.from({ length: SLOT_COUNT }, (_, i) => `<option value="${i + 1}">Slot ${i + 1}</option>`).join("");
    return `
      ${this.renderAccountBar(store)}
      <div class="slots">${slots}</div>
      ${this.renderGuestImport(store)}
      <details class="import">
        <summary>Import a save code</summary>
        <textarea id="import-code" rows="3" placeholder="Paste a save code"></textarea>
        <div class="slot-actions">
          <select id="import-slot">${slotOptions}</select>
          <button class="btn" data-action="import" ${this.syncing ? "disabled" : ""}>Import (overwrites that slot)</button>
        </div>
      </details>`;
  }

  renderAccountBar(store) {
    const auth = this.getAuth();
    if (!auth) {
      return `<p class="dim">Saves live in this browser only. Use Export in the pause menu (Esc) to move a save elsewhere.</p>
        ${this.cloudNote ? `<p class="warning-text small">${escapeHtml(this.cloudNote)}</p>` : ""}`;
    }
    if (!auth.user) {
      return `<div class="account-bar">
        <span class="dim">Playing without an account: saves stay in this browser.</span>
        <button class="btn small" data-action="sign-in">Sign in or create an account</button>
      </div>`;
    }
    const sync = this.syncing
      ? `<p class="dim small">Syncing with the cloud…</p>`
      : store.status === "offline"
        ? `<p class="warning-text small">Couldn't reach the cloud. Showing the saves on this device; they'll sync when the connection is back.</p>`
        : "";
    return `<div class="account-bar">
        <span>Signed in as <strong>${escapeHtml(auth.username ?? auth.email)}</strong> <span class="dim">· saves sync to your account</span></span>
        <button class="btn small" data-action="sign-out" ${this.busy ? "disabled" : ""}>Sign out</button>
      </div>${sync}`;
  }

  renderSlot(slot, summary) {
    const off = this.syncing ? "disabled" : "";
    if (!summary) {
      return `<div class="slot-card empty-slot">
        <h3>Slot ${slot} <span class="dim">· empty</span></h3>
        <label class="dim small">Seed <input id="seed-${slot}" class="seed-input" placeholder="random" value="${escapeHtml(this.defaultSeed ?? "")}" /></label>
        <button class="btn primary" data-action="new" data-slot="${slot}" ${off}>New game</button>
      </div>`;
    }
    const deleteButton = `<button class="btn ${this.confirmDelete === slot ? "danger" : ""}" data-action="delete" data-slot="${slot}" ${off}>${this.confirmDelete === slot ? "Really delete?" : "Delete"}</button>`;
    if (summary.conflict) return this.renderConflict(slot, summary.conflict);
    if (summary.error) {
      return `<div class="slot-card">
        <h3>Slot ${slot} <span class="warning-text">· unreadable</span></h3>
        <p class="dim small">${escapeHtml(summary.error)}</p>
        ${deleteButton}
      </div>`;
    }
    return `<div class="slot-card">
      <h3>Slot ${slot} <span class="dim">· Level ${summary.level}</span></h3>
      <p class="dim small">${describe(summary)} · seed ${summary.seed}</p>
      <div class="slot-actions">
        <button class="btn primary" data-action="continue" data-slot="${slot}" ${off}>Continue</button>
        ${deleteButton}
      </div>
    </div>`;
  }

  renderConflict(slot, { local, remote }) {
    const copy = (label, which, summary) => `
      <div class="conflict-copy">
        <h4>${label}</h4>
        <p class="dim small">${summary.error ? escapeHtml(summary.error) : `Level ${summary.level} · ${describe(summary)}`}</p>
        <div class="slot-actions">
          <button class="btn primary small" data-action="keep" data-keep="${which}" data-slot="${slot}" ${this.busy ? "disabled" : ""}>Keep this one</button>
          <button class="btn small" data-action="copy-code" data-copy="${which}" data-slot="${slot}">Copy save code</button>
        </div>
      </div>`;
    return `<div class="slot-card conflict">
      <h3>Slot ${slot} <span class="warning-text">· saved on two devices</span></h3>
      <p class="dim small">This slot changed in the cloud while this device had unsynced progress. Choose which copy to keep; the other is replaced. Copy its save code first if you might want it back.</p>
      <div class="conflict-copies">
        ${copy("This device", "local", local)}
        ${copy("Cloud", "remote", remote)}
      </div>
    </div>`;
  }

  /** Offers saves made without an account on this browser, so they aren't stranded after signing in. */
  renderGuestImport(store) {
    if (!store.owner || !this.guestStore || localStorage.getItem(GUEST_IMPORT_HIDDEN_KEY + store.owner)) return "";
    const guestSaves = this.guestStore.list().filter(({ summary }) => summary && !summary.error);
    if (!guestSaves.length) return "";
    const emptySlots = store
      .list()
      .filter(({ summary }) => !summary)
      .map(({ slot }) => slot);
    const options = emptySlots.map((s) => `<option value="${s}">account slot ${s}</option>`).join("");
    const rows = guestSaves
      .map(
        ({ slot, summary }) => `<div class="slot-actions guest-save">
          <span class="dim small">Slot ${slot} · Level ${summary.level} · ${describe(summary)}</span>
          ${
            emptySlots.length
              ? `<select id="guest-target-${slot}">${options}</select>
                 <button class="btn small" data-action="guest-copy" data-slot="${slot}" ${this.syncing ? "disabled" : ""}>Copy to account</button>`
              : `<span class="dim small">(free up an account slot first)</span>`
          }
        </div>`,
      )
      .join("");
    return `<details class="import" open>
      <summary>Saves from playing without an account on this browser</summary>
      <p class="dim small">Copy any of them into your account to keep them in the cloud.</p>
      ${rows}
      <div class="slot-actions"><button class="btn small" data-action="guest-hide">Don't show this again</button></div>
    </details>`;
  }
}

function describe(summary) {
  return `${formatDuration(summary.playTime)} played · saved ${formatAgo(summary.savedAt)}`;
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
