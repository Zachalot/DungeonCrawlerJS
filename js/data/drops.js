// Enemy drop tables. Drops are auto-collected on kill. Each entry rolls independently.
// `gold` ranges are multiplied by the enemy's level; materials go to the pouch.

export const DROP_TABLES = Object.freeze({
  zombie_common: [
    { chance: 0.6, gold: [2, 4] },
    { chance: 0.02, arrows: [2, 5] },
  ],
  green_slime: [
    { chance: 0.5, material: "greenGoop" },
    { chance: 0.1, gold: [3, 3] },
  ],
  red_slime: [
    { chance: 0.5, material: "redGoop" },
    { chance: 0.1, gold: [3, 3] },
  ],
  blue_slime: [
    { chance: 0.5, material: "blueGoop" },
    { chance: 0.1, gold: [3, 3] },
  ],
});
