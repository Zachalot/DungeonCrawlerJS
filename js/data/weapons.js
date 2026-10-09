// Weapon definitions. Damage = floor(stats[stat] × multiplier). Ranges are in tiles.

export const WEAPONS = Object.freeze({
  sword: {
    id: "sword",
    name: "Sword",
    key: "Digit1",
    stat: "str",
    multiplier: 1,
    cooldown: 0.4,
    kind: "melee",
    range: 1.7,
    arcDegrees: 90,
    knockback: 0.5,
  },
  bow: {
    id: "bow",
    name: "Bow",
    key: "Digit2",
    stat: "dex",
    multiplier: 1.5,
    cooldown: 0.6,
    kind: "projectile",
    projectile: "arrow",
    arrowCost: 1,
    range: 8,
    projectileSpeed: 14, // tiles per second
    projectileRadius: 3, // px
  },
  staff: {
    id: "staff",
    name: "Staff",
    key: "Digit3",
    stat: "int",
    multiplier: 3, // high damage, paid for in mana: there's no mana regen outside the village
    cooldown: 0.8,
    kind: "projectile",
    projectile: "fireball",
    // A cast costs manaCost + manaCostPerInt × INT, so a full bar (10 × INT) holds about 6
    // casts however much INT you have: more INT means harder hits, not more of them.
    manaCost: 5,
    manaCostPerInt: 1.5,
    range: 7,
    projectileSpeed: 10,
    projectileRadius: 6,
  },
});

export const WEAPON_ORDER = Object.freeze(["sword", "bow", "staff"]);
