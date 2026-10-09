// Enemy drop tables. Drops are auto-collected on kill. Each entry rolls independently.

export const DROP_TABLES = Object.freeze({
  zombie_common: [
    { chance: 0.6, gold: [1, 3] },
    { chance: 0.1, arrows: [2, 5] },
  ],
});
