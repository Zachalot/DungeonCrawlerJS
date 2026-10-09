const MOVE_KEYS = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
};

const PREVENT_DEFAULT = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);

/** Keyboard and mouse state, polled by the game loop. */
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed since the last consumePressed()
    this.mouse = { x: 0, y: 0, down: false }; // CSS px relative to the canvas

    window.addEventListener("keydown", (e) => {
      if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (!e.repeat) this.pressed.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.mouse.down = false;
    });
    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) this.mouse.down = true;
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  isDown(action) {
    return MOVE_KEYS[action].some((code) => this.keys.has(code));
  }

  /** Unnormalized movement direction with components in {-1, 0, 1}. */
  moveVector() {
    return {
      x: (this.isDown("right") ? 1 : 0) - (this.isDown("left") ? 1 : 0),
      y: (this.isDown("down") ? 1 : 0) - (this.isDown("up") ? 1 : 0),
    };
  }

  /** Returns and clears the set of keys pressed since the last call. */
  consumePressed() {
    const pressed = this.pressed;
    this.pressed = new Set();
    return pressed;
  }

  /** Held attack: left mouse or Space. */
  isAttacking() {
    return this.mouse.down || this.keys.has("Space");
  }
}
