// Enemy definitions at level 1; systems/scaling.js scales hp, damage, and xp for higher levels.
// Distances are in tiles; speed is a fraction of PLAYER_SPEED. `from` = the first level they appear.
// `movement: "hop"` moves in bursts (slimes). Bosses guard a dungeon's last room and drop runes.

const MELEE = {
  wanderSpeed: 0.5, // fraction of speed
  aggroRadius: 6, // requires line of sight
  deaggroRadius: 12,
  attackCooldown: 1.0, // s
  windup: 0.25, // s telegraph before the hit lands
  wanderRadius: 3,
  returnTimeout: 10, // s before snapping back to spawn
  movement: "walk",
  boss: false,
};

function enemy(fields) {
  const size = fields.size ?? 0.7;
  return Object.freeze({
    ...MELEE,
    attackRange: size / 2 + 0.65, // center to center
    stopDistance: size / 2 + 0.4, // stops advancing when this close
    ...fields,
    size,
  });
}

function boss(fields) {
  return enemy({ size: 1.4, aggroRadius: 9, deaggroRadius: 30, windup: 0.6, attackCooldown: 1.4, wanderRadius: 1, boss: true, from: 5, ...fields });
}

export const ENEMIES = Object.freeze({
  zombie: enemy({ id: "zombie", name: "Zombie", hp: 10, damage: 2, speed: 0.6, xp: 10, from: 1, dropTable: "zombie_common", color: "#6b8f5e", attackRange: 1.0, stopDistance: 0.75 }),
  greenSlime: enemy({ id: "greenSlime", name: "Green Slime", hp: 20, damage: 2, speed: 0.55, xp: 15, from: 2, movement: "hop", dropTable: "green_slime", color: "#65a30d" }),
  redSlime: enemy({ id: "redSlime", name: "Red Slime", hp: 7, damage: 4, speed: 0.65, xp: 15, from: 3, movement: "hop", dropTable: "red_slime", color: "#dc2626" }),
  blueSlime: enemy({ id: "blueSlime", name: "Blue Slime", hp: 13, damage: 2.6, speed: 0.6, xp: 15, from: 4, movement: "hop", dropTable: "blue_slime", color: "#2563eb" }),

  centaur: boss({ id: "centaur", name: "Centaur", hp: 120, damage: 6, speed: 0.85, xp: 150, rune: "str", color: "#a16207" }),
  golem: boss({ id: "golem", name: "Golem", hp: 160, damage: 7, speed: 0.4, xp: 150, rune: "end", color: "#78716c", size: 1.6 }),
  giantSlime: boss({ id: "giantSlime", name: "Giant Slime", hp: 120, damage: 6, speed: 0.6, xp: 150, rune: "int", movement: "hop", color: "#7c3aed" }),
  giantCat: boss({ id: "giantCat", name: "Giant Cat", hp: 100, damage: 6, speed: 0.95, xp: 150, rune: "dex", color: "#f97316", windup: 0.45 }),
});

/** Regular (non-boss) enemy ids, weakest first. */
export const NORMAL_ENEMIES = Object.freeze(Object.values(ENEMIES).filter((e) => !e.boss).map((e) => e.id));
export const BOSSES = Object.freeze(Object.values(ENEMIES).filter((e) => e.boss).map((e) => e.id));

/** Runes, one per stat; each drops from one boss type. */
export const RUNES = Object.freeze({
  str: { name: "Centaur Rune", stat: "str", boss: "centaur" },
  end: { name: "Golem Rune", stat: "end", boss: "golem" },
  int: { name: "Slime Rune", stat: "int", boss: "giantSlime" },
  dex: { name: "Cat Rune", stat: "dex", boss: "giantCat" },
});
export const RUNE_TYPES = Object.freeze(Object.keys(RUNES));

/** Crafting materials carried in the pouch (not the bag). */
export const MATERIALS = Object.freeze({
  wood: { name: "Wood" },
  stone: { name: "Stone" },
  greenGoop: { name: "Green Goop" },
  redGoop: { name: "Red Goop" },
  blueGoop: { name: "Blue Goop" },
});
export const MATERIAL_TYPES = Object.freeze(Object.keys(MATERIALS));
