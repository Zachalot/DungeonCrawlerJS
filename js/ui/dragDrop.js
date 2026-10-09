/**
 * HTML5 drag and drop inside a panel. Sources carry `data-drag` and targets `data-drop`,
 * both string ids such as "bag:3", "equip:chest", or "stash".
 *
 * `classify(source, target)` returns "valid", "invalid", or null (not a target for this
 * source). While dragging, targets get a .drop-valid / .drop-invalid class. Invalid targets
 * still accept the drop so `onDrop` can explain why it didn't work.
 */
export class DragDrop {
  constructor(element, { classify, onDrop }) {
    this.element = element;
    this.classify = classify;
    this.onDrop = onDrop;
    this.source = null;
    this.handlers = [
      ["dragstart", (e) => this.handleStart(e)],
      ["dragover", (e) => this.handleOver(e)],
      ["drop", (e) => this.handleDrop(e)],
      ["dragend", () => this.clear()],
    ];
  }

  attach() {
    for (const [type, handler] of this.handlers) this.element.addEventListener(type, handler);
  }

  detach() {
    for (const [type, handler] of this.handlers) this.element.removeEventListener(type, handler);
    this.clear();
  }

  handleStart(e) {
    const source = e.target.closest("[data-drag]");
    if (!source) return;
    this.source = source.dataset.drag;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", this.source); // Firefox won't start a drag without data
    for (const target of this.element.querySelectorAll("[data-drop]")) {
      const kind = this.classify(this.source, target.dataset.drop);
      target.classList.toggle("drop-valid", kind === "valid");
      target.classList.toggle("drop-invalid", kind === "invalid");
    }
  }

  handleOver(e) {
    const target = e.target.closest("[data-drop]");
    if (!this.source || !target || !this.classify(this.source, target.dataset.drop)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    for (const t of this.element.querySelectorAll(".drop-hover")) if (t !== target) t.classList.remove("drop-hover");
    target.classList.add("drop-hover");
  }

  handleDrop(e) {
    const target = e.target.closest("[data-drop]");
    const source = this.source;
    if (!source || !target || !this.classify(source, target.dataset.drop)) return;
    e.preventDefault();
    this.clear();
    this.onDrop(source, target.dataset.drop);
  }

  clear() {
    this.source = null;
    for (const t of this.element.querySelectorAll(".drop-valid, .drop-invalid, .drop-hover")) {
      t.classList.remove("drop-valid", "drop-invalid", "drop-hover");
    }
  }
}

/** Splits "bag:3" into ["bag", "3"]; "stash" into ["stash", undefined]. */
export function parseDragId(id) {
  const [kind, key] = id.split(":");
  return [kind, key];
}
