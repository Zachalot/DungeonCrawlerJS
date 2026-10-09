import { ITEMS, QUICK_WHEEL_ITEMS } from "../data/items.js";
import { countItem } from "../systems/inventory.js";
import { itemIcon } from "./items.js";

const OUTER_RADIUS = 120; // px
const INNER_RADIUS = 42; // px; releasing inside this cancels
const EDGE_MARGIN = 12; // px kept between the wheel and the screen edge

/**
 * Which of `count` equal segments (clockwise from the top, each centered on its angle) the
 * offset (dx, dy) points at, or null inside the dead zone.
 */
export function pickSegment(dx, dy, count, deadZone = INNER_RADIUS) {
  if (Math.hypot(dx, dy) < deadZone) return null;
  const step = (Math.PI * 2) / count;
  let angle = Math.atan2(dx, -dy); // 0 = up, increasing clockwise
  if (angle < 0) angle += Math.PI * 2;
  return Math.floor((angle + step / 2) / step) % count;
}

/** Keeps a wheel centered at (x, y) fully on a width × height screen. */
export function clampCenter(x, y, width, height, radius = OUTER_RADIUS + EDGE_MARGIN) {
  const clamp = (v, size) => (size < radius * 2 ? size / 2 : Math.min(size - radius, Math.max(radius, v)));
  return { x: clamp(x, width), y: clamp(y, height) };
}

/**
 * Hold-Q radial menu. Open it where the mouse is, point toward a potion, and release Q
 * to drink it; release in the middle to cancel. The game keeps running while it's open.
 */
export class QuickWheel {
  constructor(element, getGame) {
    this.element = element;
    this.getGame = getGame;
    this.center = null;
    this.selected = null;
  }

  get isOpen() {
    return this.center !== null;
  }

  open(mouseX, mouseY) {
    this.center = clampCenter(mouseX, mouseY, window.innerWidth, window.innerHeight);
    this.selected = null;
    this.element.style.left = `${this.center.x}px`;
    this.element.style.top = `${this.center.y}px`;
    this.element.hidden = false;
    this.render();
  }

  /** Re-highlights from the current mouse position (CSS px). */
  update(mouseX, mouseY) {
    if (!this.isOpen) return;
    const selected = pickSegment(mouseX - this.center.x, mouseY - this.center.y, QUICK_WHEEL_ITEMS.length);
    if (selected !== this.selected) {
      this.selected = selected;
      this.render();
    } else {
      this.renderCounts();
    }
  }

  /** Closes the wheel; returns the chosen item id, or null if the pointer was in the middle. */
  confirm() {
    const choice = this.selected === null ? null : QUICK_WHEEL_ITEMS[this.selected];
    this.cancel();
    return choice;
  }

  cancel() {
    this.center = null;
    this.selected = null;
    this.element.hidden = true;
  }

  render() {
    const { player } = this.getGame();
    const n = QUICK_WHEEL_ITEMS.length;
    const step = (Math.PI * 2) / n;
    const wedges = QUICK_WHEEL_ITEMS.map((defId, i) => {
      const classes = ["wedge", ITEMS[defId].resource, i === this.selected ? "selected" : "", countItem(player.inventory, defId) ? "" : "none"];
      return `<path class="${classes.join(" ")}" d="${wedgePath(i * step - step / 2, i * step + step / 2)}" />`;
    }).join("");

    const labels = QUICK_WHEEL_ITEMS.map((defId, i) => {
      const r = (OUTER_RADIUS + INNER_RADIUS) / 2;
      const x = Math.sin(i * step) * r;
      const y = -Math.cos(i * step) * r;
      const count = countItem(player.inventory, defId);
      return `<div class="wheel-item ${count ? "" : "none"}" style="transform: translate(${x}px, ${y}px)">
        ${itemIcon(defId)}<span class="wheel-count" data-def="${defId}">×${count}</span>
      </div>`;
    }).join("");

    const selected = this.selected === null ? null : QUICK_WHEEL_ITEMS[this.selected];
    const caption = selected ? ITEMS[selected].name : "Release to cancel";
    this.element.innerHTML = `
      <svg class="wheel-ring" viewBox="${-OUTER_RADIUS} ${-OUTER_RADIUS} ${OUTER_RADIUS * 2} ${OUTER_RADIUS * 2}"
        width="${OUTER_RADIUS * 2}" height="${OUTER_RADIUS * 2}">${wedges}
        <circle class="wheel-center ${selected ? "" : "selected"}" r="${INNER_RADIUS - 4}" />
      </svg>
      ${labels}
      <div class="wheel-caption">${caption}${player.potionCooldown > 0 ? `<br><span class="dim">cooldown</span>` : ""}</div>`;
  }

  // Counts can change while the wheel is open (the game keeps running); cheap in-place refresh.
  renderCounts() {
    const { player } = this.getGame();
    for (const el of this.element.querySelectorAll(".wheel-count")) {
      el.textContent = `×${countItem(player.inventory, el.dataset.def)}`;
    }
  }
}

// SVG path for a ring segment between two angles (radians, 0 = up, clockwise).
function wedgePath(from, to) {
  const point = (angle, r) => `${(Math.sin(angle) * r).toFixed(2)} ${(-Math.cos(angle) * r).toFixed(2)}`;
  const gap = 0.03;
  const [a, b] = [from + gap, to - gap];
  return [
    `M ${point(a, INNER_RADIUS)}`,
    `L ${point(a, OUTER_RADIUS)}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 0 1 ${point(b, OUTER_RADIUS)}`,
    `L ${point(b, INNER_RADIUS)}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 0 0 ${point(a, INNER_RADIUS)}`,
    "Z",
  ].join(" ");
}
