// Enemy definitions. Distances are in tiles; speed is a fraction of PLAYER_SPEED.

export const ENEMIES = Object.freeze({
  zombie_l1: {
    id: "zombie_l1",
    name: "Zombie",
    level: 1,
    hp: 10,
    damage: 2,
    speed: 0.6,
    wanderSpeed: 0.5, // fraction of speed
    size: 0.7,
    aggroRadius: 6, // requires line of sight
    deaggroRadius: 12,
    attackRange: 1.0, // center to center
    stopDistance: 0.75, // stops advancing when this close
    attackCooldown: 1.0, // s
    windup: 0.25, // s telegraph before the hit lands
    wanderRadius: 3,
    returnTimeout: 10, // s before snapping back to spawn
    xp: 10, // used from M3
    dropTable: "zombie_common", // used from M4
  },
});
