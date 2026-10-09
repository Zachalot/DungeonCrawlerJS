/**
 * Base for modal panels. Clicks on [data-action] elements call onAction(action, dataset),
 * then the panel re-renders. `getGame` is a function because loading a save swaps the game.
 * Panels that support drag and drop set `this.dragDrop` (a DragDrop) in their constructor.
 */
export class Panel {
  constructor(element, getGame, callbacks = {}) {
    this.element = element;
    this.getGame = getGame;
    this.callbacks = callbacks;
    this.wide = false;
    this.dragDrop = null;
    this.handleClick = (e) => {
      const target = e.target.closest("[data-action]");
      if (!target || target.disabled) return;
      if (this.onAction(target.dataset.action, target.dataset, e) === false) return;
      this.render();
    };
  }

  get game() {
    return this.getGame();
  }

  open() {
    this.element.addEventListener("click", this.handleClick);
    this.dragDrop?.attach();
    this.onOpen();
    this.render();
  }

  close() {
    this.element.removeEventListener("click", this.handleClick);
    this.dragDrop?.detach();
  }

  onOpen() {}

  /** Return false to skip the re-render (e.g. after the panel closed itself). */
  onAction() {}

  render() {}
}
