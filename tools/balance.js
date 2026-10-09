// Balance simulation: enemy scaling, leveling, ranged resources, gold, runes, and the plateau
// ("wall") every tierSize levels.
//
//   npm run balance                       warrior build, levels 1–50
//   npm run balance -- --build mage       one build's level-by-level table (see BUILDS)
//   npm run balance -- --solve            fit the wall heights so a warrior needs ~[4, 10, 10] bosses per wall
//   npm run balance -- --csv balance.csv  every build, every level, for a spreadsheet
//   npm run balance -- --set xpCurve=1.15 --set runeBonus=2   try numbers without editing anything
//
// Every number the game has comes from the game itself (js/config.js and js/data/), so the model
// can't drift from it: change a number there and rerun. The rest of P describes how a player plays
// (kills per trip, time per kill, …), which the game doesn't know. --set changes only this run.
// The model is deterministic and uses expected values (e.g. 0.3 of a boss per dungeon).

import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  ARROW_GOLD_PER_LEVEL,
  BOSS_CHANCE,
  BOSS_FROM_LEVEL,
  BOSS_GOLD_PER_LEVEL,
  CONVERT_GOLD_PER_LEVEL,
  ENCHANT_GOLD_PER_LEVEL,
  ENCHANT_TABLE_COST,
  ENEMY_DAMAGE_GROWTH,
  ENEMY_HP_GROWTH,
  GATHER_BONUS_CAP,
  GATHER_BONUS_PER_LEVEL,
  HARVEST_TIME,
  MANA_POTION_PER_LEVEL,
  NODES_PER_GATHER_LEVEL,
  POTION_CRAFT_GOLD_PER_LEVEL,
  ROCK_DENSITY,
  RUNE_BONUS,
  RUNE_CONVERT_RATIO,
  STAT_POINTS_PER_LEVEL,
  STARTING_STATS,
  STONE_PER_ROCK,
  TREE_DENSITY,
  WALL_DAMAGE_STEPS,
  WALL_HP_STEPS,
  WALL_LEVELS,
  WOOD_PER_TREE,
  XP_CURVE,
  XP_FALLOFF,
  XP_FLOOR,
  XP_PER_LEVEL,
} from "../js/config.js";
import { DROP_TABLES } from "../js/data/drops.js";
import { BOSSES, ENEMIES, NORMAL_ENEMIES } from "../js/data/enemies.js";
import { ARMOR_SLOTS, EQUIP_SLOTS, ITEMS, potionAmount } from "../js/data/items.js";
import { WEAPONS } from "../js/data/weapons.js";
import { damageReduction } from "../js/systems/combat.js";
import { runesPerBoss } from "../js/systems/scaling.js";
import { maxHp, maxMana, weaponDamage } from "../js/systems/stats.js";
import { floorsFor } from "../js/world/dungeon.js";

export { runesPerBoss };

const ZOMBIE = ENEMIES.zombie;
const mean = ([min, max]) => (min + max) / 2;
const arrowDrop = DROP_TABLES.zombie_common.find((entry) => entry.arrows);
const goldDrop = DROP_TABLES.zombie_common.find((entry) => entry.gold);
const ARROWS_PER_KILL = arrowDrop.chance * mean(arrowDrop.arrows);

// Enemy types relative to a zombie of the same level; bosses are averaged into one.
const relative = (def) => ({ hp: def.hp / ZOMBIE.hp, damage: def.damage / ZOMBIE.damage, xp: def.xp / ZOMBIE.xp, from: def.from });
const average = (list) => Object.fromEntries(Object.keys(list[0]).map((k) => [k, list.reduce((sum, x) => sum + x[k], 0) / list.length]));

// ---- Numbers ------------------------------------------------------------------

export const P = {
  // From the game. Enemy stat at level E = level-1 stat × (1 + growth × (E − 1)) × the wall
  // steps passed; a wall every tierSize levels (17, 33, 49, …).
  hpGrowth: ENEMY_HP_GROWTH,
  damageGrowth: ENEMY_DAMAGE_GROWTH,
  tierSize: WALL_LEVELS,
  tierHpSteps: [...WALL_HP_STEPS], // fit with --solve, then copy into js/config.js
  tierDamageSteps: [...WALL_DAMAGE_STEPS],
  types: {
    ...Object.fromEntries(NORMAL_ENEMIES.map((id) => [id, relative(ENEMIES[id])])),
    boss: average(BOSSES.map((id) => relative(ENEMIES[id]))),
  },
  xpBase: XP_PER_LEVEL,
  xpCurve: XP_CURVE,
  xpFalloff: XP_FALLOFF,
  xpFloor: XP_FLOOR,
  goldPerKill: goldDrop.chance * mean(goldDrop.gold), // × enemy level
  goldPerBoss: BOSS_GOLD_PER_LEVEL, // × enemy level
  arrowGoldPerLevel: ARROW_GOLD_PER_LEVEL,
  castManaBase: WEAPONS.staff.manaCost,
  castManaPerInt: WEAPONS.staff.manaCostPerInt,
  manaPotionManaPerLevel: MANA_POTION_PER_LEVEL,
  potionCraftGoldPerLevel: POTION_CRAFT_GOLD_PER_LEVEL,
  bossFrom: BOSS_FROM_LEVEL,
  bossChance: BOSS_CHANCE,
  runeBonus: RUNE_BONUS,
  convertRatio: RUNE_CONVERT_RATIO,
  enchantGoldPerLevel: ENCHANT_GOLD_PER_LEVEL,
  convertGoldPerLevel: CONVERT_GOLD_PER_LEVEL,
  firstBossGuaranteed: true, // the game always has a boss in the first boss-level dungeon until you kill one
  tableStonePerLevel: ENCHANT_TABLE_COST.stone,
  tableWoodPerLevel: ENCHANT_TABLE_COST.wood,
  woodPerTree: mean(WOOD_PER_TREE),
  stonePerRock: mean(STONE_PER_ROCK),
  gatherBonusPerLevel: GATHER_BONUS_PER_LEVEL,
  nodesPerGatherLevel: NODES_PER_GATHER_LEVEL,
  gatherBonusCap: GATHER_BONUS_CAP,

  // How a player plays (model assumptions, not game rules).
  killsPerFloor: 30, // rooms × enemies per room, roughly (js/config.js); dungeons have more floors from level 4
  secondsPerKill: 5, // walking, dodging, and looting on top of the attacks themselves
  secondsPerDungeon: 90, // getting there and back
  ammoBudgetShare: 0.3, // share of each dungeon's gold a ranged build spends on arrows or mana potions
  ownRuneShare: 0.25, // four boss types, each dropping its own stat's rune
  nodesPerDungeon: 8, // trees and rocks harvested on each trip
  secondsPerNode: HARVEST_TIME + 1, // holding F, plus a few steps out of the way

  // You're stuck at a dungeon level once a same-level zombie takes this long to kill on average:
  // 5 sword swings. Time rather than hits, so a slow, hard-hitting bow compares fairly.
  plateauSeconds: 5 * WEAPONS.sword.cooldown,

  // Armor the player wears from each level on (sets from js/data/items.js).
  armorByLevel: [
    [1, null],
    [4, "leather"],
    [8, "iron"],
    [13, "steel"],
  ],

  // --solve fits the walls to this build; the other builds are then measured against those walls.
  // Bosses to break each wall: the first is a short teaching wall, later ones the real grind.
  targetBossesPerWall: [4, 10, 10],
  referenceBuild: "warrior",
};

// Every build carries the free sword. `ranged` is used as much as arrows/mana allow; `runeStat`
// is the stat its runes go into.
export const BUILDS = {
  warrior: { split: { str: 2, end: 1 }, ranged: null, runeStat: "str" },
  berserker: { split: { str: 1 }, ranged: null, runeStat: "str" },
  spellblade: { split: { str: 2, int: 1, end: 1 }, ranged: "staff", runeStat: "str" },
  skirmisher: { split: { str: 2, dex: 1, end: 1 }, ranged: "bow", runeStat: "str" },
  archer: { split: { dex: 2, end: 1 }, ranged: "bow", runeStat: "dex" },
  mage: { split: { int: 2, end: 1 }, ranged: "staff", runeStat: "int" },
  balanced: { split: { str: 1, int: 1, dex: 1, end: 1 }, ranged: "staff", runeStat: "str" },
};

const MAX_DUNGEONS = 20_000; // safety stop when a wall can't be broken
const TREE_SHARE = TREE_DENSITY / (TREE_DENSITY + ROCK_DENSITY); // of the nodes you pass, how many are trees

/** Enemies in one dungeon of level E: a floor's worth per floor. */
function killsPerDungeon(E) {
  return P.killsPerFloor * floorsFor(E);
}

// ---- Model ------------------------------------------------------------------

/** Wall steps passed by level E, multiplied together. */
function tierFactor(steps, E) {
  const walls = Math.floor((E - 1) / P.tierSize);
  let factor = 1;
  for (let i = 0; i < walls; i++) factor *= steps[i] ?? steps.at(-1);
  return factor;
}

export function enemyStats(type, E) {
  const t = P.types[type];
  return {
    hp: ZOMBIE.hp * t.hp * (1 + P.hpGrowth * (E - 1)) * tierFactor(P.tierHpSteps, E),
    damage: ZOMBIE.damage * t.damage * (1 + P.damageGrowth * (E - 1)) * tierFactor(P.tierDamageSteps, E),
    xp: ZOMBIE.xp * E * t.xp,
  };
}

export function xpToNext(L) {
  return P.xpBase * L * P.xpCurve ** (L - 1);
}

function xpScale(L, E) {
  return Math.max(P.xpFloor, 1 - P.xpFalloff * Math.max(0, L - E));
}

function armorAt(L) {
  const tier = P.armorByLevel.filter(([from]) => L >= from).at(-1)[1];
  if (!tier) return 0;
  return ARMOR_SLOTS.reduce((sum, slot) => sum + ITEMS[`${tier}_${slot}`].armor, 0);
}

/** Stats at level L: points split by the build's ratios (fractions allowed), plus applied runes. */
export function statsAt(build, L, runes) {
  const stats = { ...STARTING_STATS };
  const points = (L - 1) * STAT_POINTS_PER_LEVEL;
  const parts = Object.values(build.split).reduce((a, b) => a + b, 0);
  for (const [stat, share] of Object.entries(build.split)) stats[stat] += (points * share) / parts;
  stats[build.runeStat] += runes * P.runeBonus;
  return stats;
}

export function castMana(stats) {
  return P.castManaBase + P.castManaPerInt * stats.int;
}

/** One fight with one weapon against a `type` enemy of level E. */
export function fight(build, L, runes, type, E, weaponId = "sword") {
  const weapon = WEAPONS[weaponId];
  const stats = statsAt(build, L, runes);
  const enemy = enemyStats(type, E);
  const damage = Math.max(1, weaponDamage(weapon, stats));
  const hits = Math.ceil(enemy.hp / damage);
  const taken = enemy.damage * (1 - damageReduction(armorAt(L)));
  const hp = Math.floor(maxHp(stats));
  return { enemy, damage, hits, seconds: hits * weapon.cooldown, hp, hitsToDie: Math.ceil(hp / Math.max(taken, 0.01)) };
}

function dungeonGold(E) {
  return killsPerDungeon(E) * P.goldPerKill * E + (E >= P.bossFrom ? P.bossChance * P.goldPerBoss * E : 0);
}

/**
 * A dungeon's worth of fighting at level E: ranged kills as far as free and bought ammo go, the
 * sword for the rest. Returns the share of kills done at range, average seconds per kill, and gold spent.
 */
export function dungeonCombat(build, L, runes, E, ammoGold = P.ammoBudgetShare * dungeonGold(E)) {
  const sword = fight(build, L, runes, "zombie", E, "sword");
  const meleeOnly = { rangedShare: 0, killSeconds: sword.seconds, ammoSpent: 0, sword, ranged: null, freeShots: 0 };
  if (!build.ranged) return meleeOnly;

  const ranged = fight(build, L, runes, "zombie", E, build.ranged);
  if (ranged.seconds >= sword.seconds) return { ...meleeOnly, ranged }; // only worth it when it kills faster
  const stats = statsAt(build, L, runes);
  let freeShots;
  let goldPerShot;
  if (build.ranged === "bow") {
    freeShots = killsPerDungeon(E) * ARROWS_PER_KILL; // arrow drops
    goldPerShot = P.arrowGoldPerLevel * L;
  } else {
    freeShots = Math.floor(maxMana(stats) / castMana(stats)); // one bar, refilled in the village
    goldPerShot = (castMana(stats) / P.manaPotionManaPerLevel) * P.potionCraftGoldPerLevel; // level cancels out
  }
  const shotsWanted = killsPerDungeon(E) * ranged.hits; // ranged for every kill, if affordable
  const shotsBought = Math.min(Math.max(0, shotsWanted - freeShots), ammoGold / goldPerShot);
  const rangedKills = Math.min(killsPerDungeon(E), (freeShots + shotsBought) / ranged.hits);
  const rangedShare = rangedKills / killsPerDungeon(E);
  return {
    rangedShare,
    killSeconds: (1 - rangedShare) * sword.seconds + rangedShare * ranged.seconds,
    ammoSpent: shotsBought * goldPerShot,
    sword,
    ranged,
    freeShots,
  };
}

/** True if same-level zombies die fast enough, on average, that dungeon level E isn't a plateau. */
function canHandle(build, L, runes, E) {
  return dungeonCombat(build, L, runes, E).killSeconds < P.plateauSeconds;
}

/** The highest dungeon level (≤ the player's level) the build can handle. */
function frontier(build, L, runes) {
  for (let E = L; E > 1; E--) if (canHandle(build, L, runes, E)) return E;
  return 1;
}

function normalTypesAt(E) {
  return Object.entries(P.types).filter(([id, t]) => id !== "boss" && E >= t.from);
}

function tableCost(level) {
  return { stone: P.tableStonePerLevel * level, wood: P.tableWoodPerLevel * level };
}

/** Harvests the trees and rocks passed on one dungeon trip; the Gathering skill adds bonus harvests. */
function gather(s) {
  const skill = 1 + Math.floor(s.nodes / P.nodesPerGatherLevel);
  const bonus = 1 + Math.min(P.gatherBonusCap, P.gatherBonusPerLevel * (skill - 1));
  s.wood += P.nodesPerDungeon * TREE_SHARE * P.woodPerTree * bonus;
  s.stone += P.nodesPerDungeon * (1 - TREE_SHARE) * P.stonePerRock * bonus;
  s.nodes += P.nodesPerDungeon;
  s.seconds += P.nodesPerDungeon * P.secondsPerNode;
}

/**
 * Back in the village: builds or upgrades the enchanting table when runes need the room, then
 * spends gold applying runes (matching ones first, then 4:1 conversions of the rest).
 */
function enchant(s) {
  const runesInHand = s.applied + s.ownWaiting + s.otherWaiting / P.convertRatio;
  while (s.table * EQUIP_SLOTS.length < runesInHand) {
    const cost = tableCost(s.table + 1);
    if (s.stone < cost.stone || s.wood < cost.wood) break;
    s.stone -= cost.stone;
    s.wood -= cost.wood;
    s.table += 1;
    if (s.table === 1) s.tableBuilt = { level: s.L, hours: round1(s.seconds / 3600), dungeons: s.dungeons };
  }
  let room = s.table * EQUIP_SLOTS.length - s.applied;

  const applyCost = P.enchantGoldPerLevel * s.L;
  const own = Math.max(0, Math.min(s.ownWaiting, s.gold / applyCost, room));
  s.ownWaiting -= own;
  s.applied += own;
  s.gold -= own * applyCost;
  s.enchantSpent += own * applyCost;
  room -= own;

  const convertCost = P.convertGoldPerLevel * s.L + applyCost; // convert, then apply
  const converted = Math.max(0, Math.min(s.otherWaiting / P.convertRatio, s.gold / convertCost, room));
  s.otherWaiting -= converted * P.convertRatio;
  s.applied += converted;
  s.gold -= converted * convertCost;
  s.enchantSpent += converted * convertCost;
}

/**
 * Plays a build from level 1, one dungeon at a time, always in the highest-level dungeon it can
 * handle. Returns a row per level reached and a summary of every wall it hit.
 */
export function simulate(build, maxLevel, { maxDungeons = MAX_DUNGEONS } = {}) {
  const s = {
    L: 1,
    xp: 0,
    gold: 0,
    applied: 0, // runes on gear
    ownWaiting: 0, // collected, matching the rune stat, not yet applied (waiting for gold)
    otherWaiting: 0, // collected, other types, not yet converted
    runes: 0, // all runes ever collected
    bosses: 0,
    dungeons: 0,
    kills: 0,
    seconds: 0,
    earned: 0,
    ammoSpent: 0,
    enchantSpent: 0,
    wood: 0,
    stone: 0,
    nodes: 0,
    table: 0, // enchanting table level built
    tableBuilt: null, // { level, hours, dungeons } when the first table went up
    sawBoss: false,
  };
  const rows = [];
  const walls = [];
  let levelStart = { ...s };
  let stuck = null;

  const snapshot = () => {
    const E = frontier(build, s.L, s.applied);
    const combat = dungeonCombat(build, s.L, s.applied, E);
    const boss = E >= P.bossFrom ? fight(build, s.L, s.applied, "boss", E) : null;
    const stats = statsAt(build, s.L, s.applied);
    rows.push({
      level: s.L,
      dungeonLevel: E,
      zombieHp: Math.round(combat.sword.enemy.hp),
      zombieDamage: round1(combat.sword.enemy.damage),
      swordDamage: combat.sword.damage,
      rangedDamage: combat.ranged?.damage ?? null,
      killSeconds: round1(combat.killSeconds),
      rangedPercent: build.ranged ? Math.round(100 * combat.rangedShare) : null,
      hitsToDie: combat.sword.hitsToDie,
      bossHits: boss?.hits ?? null,
      bossHitsToDie: boss?.hitsToDie ?? null,
      hp: combat.sword.hp,
      castsPerBar: build.ranged === "staff" ? Math.floor(maxMana(stats) / castMana(stats)) : null,
      applied: round1(s.applied),
      waiting: round1(s.ownWaiting + s.otherWaiting),
      runes: round1(s.runes),
      tableLevel: s.table,
      materials: `${Math.round(s.wood)}/${Math.round(s.stone)}`,
      killsLastLevel: Math.round(s.kills - levelStart.kills),
      dungeons: round1(s.dungeons),
      hours: round1(s.seconds / 3600),
      gold: Math.round(s.gold),
      earnedLastLevel: Math.round(s.earned - levelStart.earned),
      ammoLastLevel: Math.round(s.ammoSpent - levelStart.ammoSpent),
      enchantLastLevel: Math.round(s.enchantSpent - levelStart.enchantSpent),
      potionHealPercent: Math.round((100 * potionAmount("hp", s.L)) / Math.max(1, combat.sword.hp)),
    });
    levelStart = { ...s };
  };
  snapshot();

  // Past maxLevel, keep going only to see how the wall you're stuck at resolves.
  while ((s.L <= maxLevel || stuck) && s.dungeons < maxDungeons) {
    const E = frontier(build, s.L, s.applied);
    // Stuck = the next wall above the dungeons you can handle is at or below your own level.
    const nextWall = (Math.floor((E - 1) / P.tierSize) + 1) * P.tierSize + 1;
    const stuckAt = nextWall <= s.L ? nextWall : null;
    if (stuck && stuck.wall !== stuckAt) {
      walls.push(finishWall(stuck, s, build));
      stuck = null;
    }
    if (stuckAt && !stuck) {
      stuck = { wall: stuckAt, start: { ...s }, levelAtArrival: s.L, appliedAtArrival: s.applied, runesInHand: s.runes, table: s.table };
    }

    // One dungeon at level E.
    const types = normalTypesAt(E);
    const xpMult = types.reduce((sum, [, t]) => sum + t.xp, 0) / types.length;
    const income = dungeonGold(E);
    const combat = dungeonCombat(build, s.L, s.applied, E, Math.min(P.ammoBudgetShare * income, s.gold + income));
    let bosses = E >= P.bossFrom ? P.bossChance : 0;
    if (bosses && P.firstBossGuaranteed && !s.sawBoss) bosses = 1;
    if (bosses) s.sawBoss = true;
    const scale = xpScale(s.L, E);
    s.xp += killsPerDungeon(E) * ZOMBIE.xp * E * xpMult * scale + bosses * enemyStats("boss", E).xp * scale;
    s.kills += killsPerDungeon(E);
    s.gold += income - combat.ammoSpent;
    s.earned += income;
    s.ammoSpent += combat.ammoSpent;
    s.bosses += bosses;
    const runes = bosses * runesPerBoss(E);
    s.runes += runes;
    s.ownWaiting += runes * P.ownRuneShare;
    s.otherWaiting += runes * (1 - P.ownRuneShare);
    s.seconds += killsPerDungeon(E) * (combat.killSeconds + P.secondsPerKill) + P.secondsPerDungeon;
    if (bosses) s.seconds += bosses * fight(build, s.L, s.applied, "boss", E).seconds * 3; // bosses are fought carefully
    s.dungeons += 1;
    gather(s);

    while (s.xp >= xpToNext(s.L)) {
      s.xp -= xpToNext(s.L);
      s.L += 1;
      if (s.L <= maxLevel) snapshot();
    }
    enchant(s); // back in the village
  }
  if (stuck) walls.push(finishWall(stuck, s, build, true));
  return { rows, walls, tableBuilt: s.tableBuilt };
}

function finishWall(stuck, s, build, unbroken = false) {
  const { start } = stuck;
  // Levels alone: how high would you need to level, with only the runes you arrived with?
  let levelsAlone = null;
  for (let L = stuck.levelAtArrival; L <= stuck.levelAtArrival + 60; L++) {
    if (canHandle(build, L, stuck.appliedAtArrival, stuck.wall)) {
      levelsAlone = L;
      break;
    }
  }
  return {
    wall: stuck.wall,
    unbroken,
    arrivedAtLevel: stuck.levelAtArrival,
    arrivedAtHours: round1(start.seconds / 3600),
    appliedAtArrival: round1(stuck.appliedAtArrival),
    runesInHand: round1(stuck.runesInHand),
    tableAtArrival: stuck.table,
    bosses: round1(s.bosses - start.bosses),
    dungeons: Math.round(s.dungeons - start.dungeons),
    hours: round1((s.seconds - start.seconds) / 3600),
    levelsGained: s.L - start.L,
    appliedGained: round1(s.applied - start.applied),
    enchantGold: Math.round(s.enchantSpent - start.enchantSpent),
    levelsAlone,
  };
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

// ---- Solver -----------------------------------------------------------------

/** Bosses needed to break wall number `index` (0 = level 17) for a build, or Infinity. */
function bossesAtWall(build, index, maxLevel) {
  const wall = simulate(build, maxLevel).walls.find((w) => w.wall === (index + 1) * P.tierSize + 1);
  if (!wall) return 0; // never got stuck there
  return wall.unbroken ? Infinity : wall.bosses;
}

/** Bisects `set(x)` over [lo, hi] so that `measure()` lands on the target; `measure` grows with x. */
function bisect(set, measure, target, lo, hi) {
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    set(mid);
    if (measure() > target) hi = mid;
    else lo = mid;
  }
  set((lo + hi) / 2);
}

function targetBosses(index) {
  return P.targetBossesPerWall[index] ?? P.targetBossesPerWall.at(-1);
}

/** For the current rune bonus, finds each wall's HP step so that breaking it takes targetBossesPerWall bosses. */
function solve(build, maxLevel) {
  for (let i = 0; i < P.tierHpSteps.length; i++) {
    if ((i + 1) * P.tierSize + 1 > maxLevel) break;
    bisect((x) => (P.tierHpSteps[i] = x), () => bossesAtWall(build, i, maxLevel), targetBosses(i), 1, 30);
  }
  return P.tierHpSteps;
}

// ---- Output -----------------------------------------------------------------

function table(rows, columns) {
  const cells = rows.map((row) => columns.map(([, key, format]) => (format ? format(row[key], row) : String(row[key] ?? "–"))));
  const widths = columns.map(([title], i) => Math.max(title.length, ...cells.map((c) => c[i].length)));
  const line = (values) => values.map((v, i) => v.padStart(widths[i])).join("  ");
  return [line(columns.map(([title]) => title)), line(widths.map((w) => "-".repeat(w))), ...cells.map(line)].join("\n");
}

const LEVEL_COLUMNS = [
  ["Lvl", "level"],
  ["Dng", "dungeonLevel"],
  ["ZomHP", "zombieHp"],
  ["ZomDmg", "zombieDamage"],
  ["Sword", "swordDamage"],
  ["Ranged", "rangedDamage"],
  ["Range%", "rangedPercent"],
  ["Secs", "killSeconds"],
  ["Die", "hitsToDie"],
  ["BossHits", "bossHits"],
  ["BossDie", "bossHitsToDie"],
  ["Casts", "castsPerBar"],
  ["Runes", "applied", (v, row) => `${v}/${row.runes}`],
  ["Waiting", "waiting"],
  ["Table", "tableLevel"],
  ["Wood/Stone", "materials"],
  ["Kills", "killsLastLevel"],
  ["Dungeons", "dungeons"],
  ["Hours", "hours"],
  ["Earned", "earnedLastLevel"],
  ["Ammo", "ammoLastLevel"],
  ["Enchant", "enchantLastLevel"],
  ["Gold", "gold"],
  ["Potion%", "potionHealPercent"],
];

const WALL_COLUMNS = [
  ["Wall", "wall"],
  ["Arrive lvl", "arrivedAtLevel"],
  ["At hour", "arrivedAtHours"],
  ["Runes found", "runesInHand"],
  ["Runes on", "appliedAtArrival"],
  ["Table", "tableAtArrival"],
  ["Bosses", "bosses", (v, w) => (w.unbroken ? "never" : String(v))],
  ["Dungeons", "dungeons"],
  ["Hours stuck", "hours"],
  ["Lvls gained", "levelsGained"],
  ["Runes +", "appliedGained"],
  ["Enchant gold", "enchantGold"],
  ["Lvls alone", "levelsAlone", (v) => (v === null ? "60+" : `lvl ${v}`)],
];

function printLegend() {
  console.log(`Dng = highest dungeon level you can handle (its zombies die in under ${P.plateauSeconds} s on average).
Sword / Ranged = damage per hit. Range% = share of kills done at range before arrows or mana run out.
Secs = average seconds per kill. Die = zombie hits until you die (with armor); BossHits / BossDie = vs that level's boss.
Casts = staff casts per full mana bar. Runes = applied / ever collected; Waiting = collected, not yet applied (gold-limited).
Table = enchanting table level built (it holds ${EQUIP_SLOTS.length} pieces × level runes). Wood/Stone = materials on hand.
Kills, Earned, Ammo, Enchant = during the previous level. Gold = in the bank. Potion% = a potion of your level heals this % of max HP.
Walls: Runes found / on = collected / applied on arrival; Table = its level on arrival;
Bosses = boss kills while stuck; Lvls alone = the level that would break the wall with no new runes.`);
}

function printEnemies() {
  const levels = [1, 2, 3, 4, 5, 8, 12, 16, 17, 24, 32, 33, 48, 49];
  const rows = levels.map((E) => {
    const row = { level: E };
    for (const type of Object.keys(P.types)) {
      const e = enemyStats(type, E);
      row[type] = E >= P.types[type].from ? `${Math.round(e.hp)}/${round1(e.damage)}` : "–";
    }
    row.xpToNext = Math.round(xpToNext(E));
    row.runesPerBoss = runesPerBoss(E).toFixed(2);
    row.arrow = (P.arrowGoldPerLevel * E).toFixed(1);
    row.enchant = P.enchantGoldPerLevel * E;
    return row;
  });
  console.log("\n=== Enemies (HP/damage) and prices by level ===\n");
  console.log(
    table(rows, [
      ["Lvl", "level"],
      ...Object.keys(P.types).map((type) => [type, type]),
      ["XP to next", "xpToNext"],
      ["Runes/boss", "runesPerBoss"],
      ["Arrow g", "arrow"],
      ["Enchant g", "enchant"],
    ]),
  );
}

function printBuild(name, maxLevel) {
  const { rows, walls } = simulate(BUILDS[name], maxLevel);
  const { split, ranged, runeStat } = BUILDS[name];
  console.log(`\n=== ${name}: sword${ranged ? ` + ${ranged}` : ""}, points ${JSON.stringify(split)}, runes into ${runeStat} ===\n`);
  console.log(table(rows, LEVEL_COLUMNS));
  console.log(`\nWalls hit by ${name}:`);
  console.log(walls.length ? table(walls, WALL_COLUMNS) : "  none");
}

function printWallsAllBuilds(maxLevel) {
  console.log("\n=== Walls, every build ===");
  for (const name of Object.keys(BUILDS)) {
    const { walls, tableBuilt } = simulate(BUILDS[name], maxLevel);
    const built = tableBuilt ? `table built at level ${tableBuilt.level} (${tableBuilt.hours} h, ${tableBuilt.dungeons} dungeons)` : "no table built";
    console.log(`\n${name}: ${built}`);
    console.log(walls.length ? table(walls, WALL_COLUMNS) : "  none");
  }
}

// ---- CLI --------------------------------------------------------------------

function parseArgs(argv) {
  const args = { build: "warrior", levels: 50, csv: null, solve: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--build") args.build = argv[++i];
    else if (argv[i] === "--levels") args.levels = Number(argv[++i]);
    else if (argv[i] === "--csv") args.csv = argv[++i];
    else if (argv[i] === "--solve") args.solve = true;
    else if (argv[i] === "--set") setParam(argv[++i]);
  }
  if (!BUILDS[args.build]) throw new Error(`Unknown build "${args.build}". Builds: ${Object.keys(BUILDS).join(", ")}`);
  return args;
}

/** --set name=value for a number in P, or name=a,b,c for a list (e.g. tierHpSteps). */
function setParam(assignment) {
  const [name, value] = assignment.split("=");
  if (!(name in P) || (typeof P[name] === "object" && !Array.isArray(P[name]))) {
    throw new Error(`--set can change a number or list in P, e.g. --set xpCurve=1.15. "${name}" isn't one.`);
  }
  P[name] = Array.isArray(P[name]) ? value.split(",").map(Number) : Number(value);
}

function writeCsv(path, maxLevel) {
  const keys = LEVEL_COLUMNS.map(([, key]) => key).concat("runes", "hp");
  const lines = [["build", ...keys].join(",")];
  for (const name of Object.keys(BUILDS)) {
    for (const row of simulate(BUILDS[name], maxLevel).rows) lines.push([name, ...keys.map((k) => row[k] ?? "")].join(","));
  }
  writeFileSync(path, `${lines.join("\n")}\n`);
  console.log(`\nWrote ${lines.length - 1} rows to ${path}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.solve) {
    const steps = solve(BUILDS[P.referenceBuild], args.levels);
    console.log(`Solved for "${P.referenceBuild}" with runeBonus ${P.runeBonus}: wall HP steps so the walls take ~[${P.targetBossesPerWall}] bosses.`);
    console.log(`  tierHpSteps = [${steps.map((x) => x.toFixed(2)).join(", ")}]   (copy into P to keep them)`);
    console.log("  The tables below use these values.\n");
  }
  printLegend();
  printEnemies();
  printBuild(args.build, args.levels);
  printWallsAllBuilds(args.levels);
  if (args.csv) writeCsv(args.csv, args.levels);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(); // run as a script, not when imported
