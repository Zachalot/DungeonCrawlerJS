/** Viewport into the current area; (x, y) is the top-left corner in world px. */
export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.width = 0;
    this.height = 0;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  /** Centers on a point, clamped so the view never leaves a bounded area (small ones are centered). */
  follow(targetX, targetY, area) {
    if (area.endless) {
      this.x = Math.round(targetX - this.width / 2);
      this.y = Math.round(targetY - this.height / 2);
      return;
    }
    this.x = Math.round(clampAxis(targetX - this.width / 2, this.width, area.widthPx));
    this.y = Math.round(clampAxis(targetY - this.height / 2, this.height, area.heightPx));
  }

  screenToWorld(sx, sy) {
    return { x: sx + this.x, y: sy + this.y };
  }
}

function clampAxis(value, viewSize, areaSize) {
  if (areaSize <= viewSize) return (areaSize - viewSize) / 2;
  return Math.min(areaSize - viewSize, Math.max(0, value));
}
