const TOAST_TIME = 1600; // ms

/** Center-screen messages; a message already showing is refreshed instead of duplicated. */
export class Toasts {
  constructor(container) {
    this.container = container;
    this.active = new Map(); // text → { element, timeout }
  }

  show(text) {
    const existing = this.active.get(text);
    if (existing) {
      clearTimeout(existing.timeout);
      existing.timeout = setTimeout(() => this.remove(text), TOAST_TIME);
      return;
    }
    const element = document.createElement("div");
    element.className = "toast";
    element.textContent = text;
    this.container.appendChild(element);
    this.active.set(text, { element, timeout: setTimeout(() => this.remove(text), TOAST_TIME) });
  }

  remove(text) {
    const entry = this.active.get(text);
    if (!entry) return;
    entry.element.remove();
    this.active.delete(text);
  }
}
