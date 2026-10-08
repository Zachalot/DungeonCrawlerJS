import { ARMOR_K } from "../config.js";

/** Fraction of incoming damage removed by armor, in [0, 1). */
export function damageReduction(armor) {
  return armor / (armor + ARMOR_K);
}

/**
 * Whole-number damage after armor. The fractional remainder becomes the chance
 * of one extra point, so the average equals raw × (1 − reduction).
 */
export function mitigate(rawDamage, armor, random = Math.random) {
  const reduced = rawDamage * (1 - damageReduction(armor));
  const whole = Math.floor(reduced);
  return whole + (random() < reduced - whole ? 1 : 0);
}

/** True if (px, py) lies within `range` px of the origin and inside the arc around `angle`. */
export function isInArc(originX, originY, angle, arcRadians, range, px, py) {
  const dx = px - originX;
  const dy = py - originY;
  const distance = Math.hypot(dx, dy);
  if (distance > range) return false;
  if (distance === 0) return true;
  return Math.abs(angleDifference(Math.atan2(dy, dx), angle)) <= arcRadians / 2;
}

function angleDifference(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
