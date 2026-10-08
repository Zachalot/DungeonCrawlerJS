import { REGEN } from "../config.js";
import { maxHp, maxMana } from "./stats.js";

/** Regenerates HP and mana; fractions accumulate so stored values stay whole. */
export function applyRegen(player, dt, { inVillage, inCombat }) {
  const rates = inVillage ? REGEN.village : inCombat ? REGEN.combat : REGEN.idle;
  player.hp = regenResource(player, "hp", player.hp, maxHp(player.stats), rates.hp * dt);
  player.mana = regenResource(player, "mana", player.mana, maxMana(player.stats), rates.mana * dt);
}

function regenResource(player, key, current, max, fractionOfMax) {
  if (current >= max) {
    player.regenRemainder[key] = 0;
    return max;
  }
  const total = player.regenRemainder[key] + fractionOfMax * max;
  const whole = Math.floor(total);
  player.regenRemainder[key] = total - whole;
  return Math.min(max, current + whole);
}
