import { HP_PER_END, MANA_PER_INT } from "../config.js";
import { ITEMS } from "../data/items.js";

export function maxHp(stats) {
  return stats.end * HP_PER_END;
}

export function maxMana(stats) {
  return stats.int * MANA_PER_INT;
}

/**
 * Damage per hit: floor(stats[stat] × multiplier) from the weapon kind (data/weapons.js),
 * plus the equipped weapon item's flat bonus, if one is given.
 */
export function weaponDamage(weapon, stats, equipped = null) {
  const bonus = equipped ? ITEMS[equipped.defId].weaponBonus : 0;
  return Math.floor(stats[weapon.stat] * weapon.multiplier) + bonus;
}
