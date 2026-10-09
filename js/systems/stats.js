import { HP_PER_END, MANA_PER_INT, RUNE_BONUS } from "../config.js";
import { EQUIP_SLOTS, ITEMS } from "../data/items.js";

export function maxHp(stats) {
  return stats.end * HP_PER_END;
}

export function maxMana(stats) {
  return stats.int * MANA_PER_INT;
}

/** Stat points a gear piece's runes add: { str: 6, … } (empty if it has none). */
export function enchantStats(instance) {
  const bonus = {};
  for (const [stat, runes] of Object.entries(instance?.enchants ?? {})) bonus[stat] = runes * RUNE_BONUS;
  return bonus;
}

/** Runes applied to a gear piece. */
export function runeCount(instance) {
  return Object.values(instance?.enchants ?? {}).reduce((sum, n) => sum + n, 0);
}

/** The player's stats plus the runes on everything equipped. Use for combat, HP, and mana. */
export function totalStats(player) {
  const stats = { ...player.stats };
  for (const slot of EQUIP_SLOTS) {
    for (const [stat, bonus] of Object.entries(enchantStats(player.equipment?.[slot]))) stats[stat] += bonus;
  }
  return stats;
}

/**
 * Damage per hit: floor(stats[stat] × multiplier) from the weapon kind (data/weapons.js),
 * plus the equipped weapon item's flat bonus, if one is given.
 */
export function weaponDamage(weapon, stats, equipped = null) {
  const bonus = equipped ? ITEMS[equipped.defId].weaponBonus : 0;
  return Math.floor(stats[weapon.stat] * weapon.multiplier) + bonus;
}

/** Mana for one staff cast: rises with INT, so a full bar holds about the same number of casts. */
export function castManaCost(weapon, stats) {
  return Math.round(weapon.manaCost + (weapon.manaCostPerInt ?? 0) * stats.int);
}
