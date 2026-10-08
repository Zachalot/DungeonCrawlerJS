import { HP_PER_END, MANA_PER_INT } from "../config.js";

export function maxHp(stats) {
  return stats.end * HP_PER_END;
}

export function maxMana(stats) {
  return stats.int * MANA_PER_INT;
}

/** Damage per hit for a weapon definition, floored once at the end. */
export function weaponDamage(weapon, stats) {
  return Math.floor(stats[weapon.stat] * weapon.multiplier);
}
