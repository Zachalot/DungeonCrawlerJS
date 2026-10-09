import {
  ATTACK_BUFFER_TIME,
  BOSS_CHANCE,
  BOSS_FROM_LEVEL,
  FOG_REVEAL_RADIUS,
  HARVEST_TIME,
  INTERACT_RANGE,
  MAX_ARROWS,
  NODE_REGROW_TIME,
  OUT_OF_COMBAT_DELAY,
  PLAYER_IFRAMES,
  RESPAWN_IFRAMES,
  RUNE_BONUS,
  STASH_SIZE,
  TILE_SIZE,
  VILLAGE_SIZE,
} from "./config.js";
import { BOSSES, MATERIALS, RUNES } from "./data/enemies.js";
import { ITEMS, SLOT_NAMES, STARTER_WEAPONS, STARTING_ITEMS } from "./data/items.js";
import { STRUCTURES, structureCost } from "./data/structures.js";
import { WEAPONS } from "./data/weapons.js";
import { Enemy } from "./entities/enemy.js";
import { Player } from "./entities/player.js";
import { Projectile } from "./entities/projectile.js";
import { isInArc, mitigate } from "./systems/combat.js";
import { drinkPotion } from "./systems/consumables.js";
import { craftPotion } from "./systems/crafting.js";
import { buryGear, isGraveEmpty, recoverGrave } from "./systems/death.js";
import { buyEntry, repurchase, sellFromSlot, vendorStock } from "./systems/economy.js";
import { Effects } from "./systems/effects.js";
import { applyRune, convertRunes, enchantCost } from "./systems/enchanting.js";
import { harvest, harvestNode, hasTool } from "./systems/gathering.js";
import { addInstance, addItem, countItem, createSlots, equipFromInventory, equipToSlot, moveInBag, takeItem, unequip } from "./systems/inventory.js";
import { allocatePoints, grantXp, respec, respecCost } from "./systems/leveling.js";
import { collectDrops, rollChestLoot, rollDrops } from "./systems/loot.js";
import { applyRegen } from "./systems/regen.js";
import { enemyAtLevel, xpScale } from "./systems/scaling.js";
import { Spawner } from "./systems/spawner.js";
import { castManaCost, maxHp, maxMana, totalStats, weaponDamage } from "./systems/stats.js";
import { hasLineOfSight, moveAndCollide } from "./world/collision.js";
import { floorsFor, generateDungeon } from "./world/dungeon.js";
import { Fog } from "./world/fog.js";
import { dungeonForCell, dungeonForTile } from "./world/dungeons.js";
import { VILLAGE_NPCS, VILLAGE_ORIGIN, VILLAGE_SPAWN } from "./world/village.js";
import { World } from "./world/world.js";

const T = TILE_SIZE;

export const TextColor = Object.freeze({
  dealt: "#f8fafc",
  taken: "#ef4444",
  blocked: "#9ca3af",
  reward: "#fbbf24",
  levelUp: "#a3e635",
  heal: "#4ade80",
  mana: "#60a5fa",
  material: "#d6c7a1",
});

const NO_WEAPON_RETRY = 0.5; // s between "no weapon equipped" reminders while attack is held
const HARVEST_RANGE = 1.4; // tiles from the player's center to a tree or rock's center
const REGROW_CHECK_INTERVAL = 1; // s

const PURCHASE_FAILURES = {
  gold: "Not enough gold",
  space: "Inventory full",
  quiver: "Your quiver is full",
  missing: "That item is gone",
};

const ENCHANT_FAILURES = {
  piece: "Only armor and weapons can hold runes.",
  rune: "You don't have that rune.",
  full: "That piece is full. Upgrade the table to hold more runes per piece.",
  gold: "Not enough gold.",
  same: "Pick two different rune types.",
};

const CRAFT_FAILURES = {
  level: "Upgrade the Potion Table to brew potions of that level.",
  materials: "You don't have enough goop.",
  gold: "Not enough gold.",
  space: "Inventory full",
};

/**
 * The simulation, independent of the DOM. Call update() once per fixed step with the
 * current controls; the UI reads state and drains `events` ({ type: "toast" | "autosave" }).
 *
 * The player is always in one "area": the overworld (`world`) or one floor of a dungeon.
 * Both expose getTileInfo / isSolidAt / isSafeZone / widthPx / heightPx.
 */
export class Game {
  constructor(seed, { random = Math.random } = {}) {
    this.random = random;
    this.world = new World(seed);
    this.area = this.world;
    this.player = new Player(VILLAGE_SPAWN.x, VILLAGE_SPAWN.y);
    this.enemies = [];
    this.projectiles = [];
    this.effects = new Effects();
    this.spawner = new Spawner(this.world, random);
    this.events = [];
    this.time = 0;
    this.view = null; // camera rect in px, set by the renderer each frame

    this.nextUid = 1;
    this.newUid = () => `i${this.nextUid++}`;
    this.stash = { gold: 0, items: createSlots(STASH_SIZE) };
    this.buyback = []; // recently sold items; not saved
    for (const { defId, qty } of STARTING_ITEMS) addItem(this.player.inventory, defId, qty, this.newUid);
    this.equipStarterWeapons();

    this.dungeonState = new Map(); // dungeon id → { cleared, chest: { gold, items } | null, visited }
    this.visit = null; // the dungeon visit in progress, see enterDungeon
    this.overworldEnemies = null; // parked while the player is in a dungeon
    this.wasSafe = true;
    this.grave = null; // { x, y, equipment, items, arrows }; at most one
    this.playTime = 0; // s, unpaused
    this.structures = []; // [{ kind, tx, ty, level }] placed in the village
    this.flags = { seenBoss: false, seenRune: false };
    this.harvesting = null; // { tx, ty, progress } while F is held at a tree or rock
    this.regrowTimer = 0;

    this.godMode = false; // dev panel: take no damage
    this.showHitboxes = false; // dev panel: draw collision boxes and aggro radii

    this.fog = new Fog(); // overworld exploration; saved
    this.dungeonFog = new Fog(); // current dungeon floor only; reset on each visit
    this.lastRevealKey = null;
    this.revealAroundPlayer();

    // Enemies treat the village as solid so they can never enter it.
    this.enemySolids = {
      isSolidAt: (tx, ty) => this.area.isSolidAt(tx, ty) || this.area.isSafeZone(tx, ty),
    };
  }

  get inDungeon() {
    return this.area.kind === "dungeon";
  }

  /** Stats including the runes on equipped gear. */
  get stats() {
    return totalStats(this.player);
  }

  /**
   * `controls`: { move: {x, y}, aim: {x, y} world px, attack: held bool,
   * attackPressed: bool (a click/press since the last step), weapon: id | null,
   * interactHeld: bool (F is down, for harvesting) }.
   */
  update(dt, controls) {
    this.time += dt;
    this.playTime += dt;
    const player = this.player;

    if (controls.weapon && WEAPONS[controls.weapon]) player.weapon = controls.weapon;
    player.update(dt, controls.move, controls.aim, this.area);
    player.attackCooldown = Math.max(0, player.attackCooldown - dt);
    player.attackBuffer = Math.max(0, player.attackBuffer - dt);
    player.potionCooldown = Math.max(0, player.potionCooldown - dt);
    player.iframes = Math.max(0, player.iframes - dt);
    player.flash = Math.max(0, player.flash - dt);

    // A press fires on this step if ready; one made late in a cooldown fires the moment it ends.
    if (controls.attackPressed) player.attackBuffer = ATTACK_BUFFER_TIME;
    if ((controls.attack || player.attackBuffer > 0) && player.attackCooldown === 0) {
      player.attackBuffer = 0;
      this.attack();
    }

    this.updateProjectiles(dt);
    this.updateEnemies(dt);
    this.effects.update(dt);
    this.updateHarvest(dt, controls.interactHeld ?? false);
    this.updateRegrowth(dt);

    this.revealAroundPlayer();
    const safe = this.isPlayerSafe();
    if (safe && !this.wasSafe) this.autosave("village");
    this.wasSafe = safe;

    applyRegen(player, dt, { inVillage: safe, inCombat: this.isInCombat() });
    if (!this.inDungeon) this.spawner.update(dt, this.time, player, this.enemies, this.view);

    if (player.hp <= 0) this.onPlayerDeath();
  }

  /** Fog for the current area: the saved overworld fog, or this dungeon floor's. */
  get currentFog() {
    return this.inDungeon ? this.dungeonFog : this.fog;
  }

  // Reveals the fog around the player, but only when they've moved to a new tile.
  revealAroundPlayer() {
    const { tileX, tileY } = this.player;
    const key = `${this.area.kind}:${this.visit?.floor ?? 0}:${tileX},${tileY}`;
    if (key === this.lastRevealKey) return;
    this.lastRevealKey = key;
    this.currentFog.reveal(tileX, tileY, FOG_REVEAL_RADIUS);
  }

  isPlayerSafe() {
    return this.area.isSafeZone(this.player.tileX, this.player.tileY);
  }

  isInCombat() {
    return this.time - this.player.lastCombatTime < OUT_OF_COMBAT_DELAY;
  }

  // ---- Combat -------------------------------------------------------------

  attack() {
    const player = this.player;
    const weapon = WEAPONS[player.weapon];
    const equipped = player.equipment[player.weapon];
    if (!equipped) {
      player.attackCooldown = NO_WEAPON_RETRY;
      this.toast(`No ${weapon.name.toLowerCase()} equipped. Equip one in your inventory (I).`);
      return;
    }
    player.attackCooldown = weapon.cooldown;
    const stats = this.stats;

    if (weapon.kind === "melee") {
      this.swingSword(weapon, equipped, stats);
      return;
    }
    const manaCost = weapon.manaCost ? castManaCost(weapon, stats) : 0;
    if (weapon.arrowCost && player.arrows < weapon.arrowCost) {
      this.toast("No arrows!");
      return;
    }
    if (manaCost && player.mana < manaCost) {
      this.toast(`Not enough mana (a cast costs ${manaCost})`);
      return;
    }
    player.arrows -= weapon.arrowCost ?? 0;
    player.mana -= manaCost;

    const muzzle = player.half + 4;
    this.projectiles.push(
      new Projectile({
        kind: weapon.projectile,
        x: player.x + Math.cos(player.aimAngle) * muzzle,
        y: player.y + Math.sin(player.aimAngle) * muzzle,
        angle: player.aimAngle,
        speed: weapon.projectileSpeed * T,
        range: weapon.range * T,
        radius: weapon.projectileRadius,
        damage: weaponDamage(weapon, stats, equipped),
      }),
    );
  }

  swingSword(weapon, equipped, stats) {
    const player = this.player;
    const arc = (weapon.arcDegrees * Math.PI) / 180;
    const damage = weaponDamage(weapon, stats, equipped);
    this.effects.addSwing(player.x, player.y, player.aimAngle, weapon.range * T, arc);

    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      if (!isInArc(player.x, player.y, player.aimAngle, arc, weapon.range * T + enemy.half, enemy.x, enemy.y)) continue;
      const away = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      this.damageEnemy(enemy, damage, away, weapon.knockback);
    }
  }

  damageEnemy(enemy, damage, knockbackAngle = null, knockbackTiles = 0) {
    this.player.lastCombatTime = this.time;
    this.effects.addText(enemy.x, enemy.y - enemy.half, String(damage), TextColor.dealt);
    if (enemy.takeHit(damage, knockbackAngle, knockbackTiles)) {
      this.effects.addPuff(enemy.x, enemy.y, enemy.def.color);
      // Dungeon enemies stay dead for the rest of the visit; overworld ones respawn on a timer.
      if (!this.inDungeon) this.spawner.onEnemyKilled(enemy, this.time);
      this.rewardKill(enemy);
    }
  }

  rewardKill(enemy) {
    const player = this.player;
    const { def } = enemy;
    const drops = rollDrops(def, this.random);
    collectDrops(player, drops);
    const xp = Math.max(1, Math.round(def.xp * xpScale(player.level, def.level)));
    const rewards = [`+${xp} XP`];
    if (drops.gold) rewards.push(`+${drops.gold} g`);
    if (drops.arrows) rewards.push(`+${drops.arrows} arrows`);
    for (const [id, n] of Object.entries(drops.materials)) rewards.push(`+${n} ${MATERIALS[id].name}`);
    this.effects.addText(enemy.x, enemy.y - enemy.half - 14, rewards.join("  "), TextColor.reward);

    if (def.boss) this.onBossKilled(enemy, drops.runes);

    const levels = grantXp(player, xp);
    if (levels > 0) {
      this.effects.addText(player.x, player.y - player.half - 14, "LEVEL UP!", TextColor.levelUp);
      this.toast(`Level up! You are level ${player.level}. Press C to spend ${player.unspentPoints} stat points.`);
    }
  }

  onBossKilled(enemy, runes) {
    if (this.visit) this.visit.bossKilled = true;
    this.flags.seenBoss = true;
    const [[stat, count] = []] = Object.entries(runes);
    if (!count) return;
    this.toast(`${enemy.def.name} defeated! It dropped ${count} ${RUNES[stat].name}${count > 1 ? "s" : ""}.`);
    if (!this.flags.seenRune) {
      this.flags.seenRune = true;
      this.toast(`Runes add +${RUNE_BONUS} to a stat when applied to gear. Build an Enchanting Table in the village (press B there) to use them.`);
    }
  }

  /** Applies armor and i-frames; returns the damage actually taken. */
  damagePlayer(rawDamage) {
    const player = this.player;
    if (player.iframes > 0 || this.godMode) return 0;
    player.lastCombatTime = this.time;

    const taken = mitigate(rawDamage, player.armor, this.random);
    if (taken === 0) {
      this.effects.addText(player.x, player.y - player.half, "Blocked!", TextColor.blocked);
      return 0;
    }
    player.hp = Math.max(0, player.hp - taken);
    player.iframes = PLAYER_IFRAMES;
    player.flash = PLAYER_IFRAMES;
    this.effects.addText(player.x, player.y - player.half, String(taken), TextColor.taken);
    return taken;
  }

  updateProjectiles(dt) {
    for (const projectile of this.projectiles) {
      const hit = projectile.update(dt, this.area, this.enemies);
      if (hit) this.damageEnemy(hit, projectile.damage);
      if (projectile.dead) this.effects.addPuff(projectile.x, projectile.y, projectile.kind === "fireball" ? "#f97316" : "#d6c7a1");
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  updateEnemies(dt) {
    const ctx = {
      player: this.player,
      playerSafe: this.isPlayerSafe(),
      canSee: (x0, y0, x1, y1) => hasLineOfSight(this.area, x0, y0, x1, y1),
      solids: this.enemySolids,
      onAttack: (enemy) => this.damagePlayer(enemy.def.damage),
    };
    this.enemies = this.enemies.filter((e) => !e.dead);
    if (this.visit) this.visit.floors.get(this.visit.floor).enemies = this.enemies;
    for (const enemy of this.enemies) enemy.update(dt, ctx);
    this.separateEnemies();
  }

  // Pushes overlapping enemies apart so packs don't stack into one sprite.
  separateEnemies() {
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      for (let j = i + 1; j < es.length; j++) {
        const a = es[i];
        const b = es[j];
        const minDistance = a.half + b.half;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        if (distance >= minDistance) continue;
        if (distance === 0) {
          dx = 1;
          dy = 0;
          distance = 1;
        }
        const push = (minDistance - distance) / 2;
        moveAndCollide(this.enemySolids, a, (-dx / distance) * push, (-dy / distance) * push);
        moveAndCollide(this.enemySolids, b, (dx / distance) * push, (dy / distance) * push);
      }
    }
  }

  // ---- Interaction --------------------------------------------------------

  /** Everything the player could interact with in the current area: [{ kind, name, prompt, tx, ty, ... }]. */
  interactables() {
    if (this.inDungeon) {
      const { portal, stairsUp, stairsDown, chest, rope, id, floor, floors } = this.area;
      const list = [];
      if (portal) list.push({ kind: "portal", name: "Exit", prompt: "[F] Leave dungeon", ...portal });
      if (stairsUp) list.push({ kind: "stairsUp", name: `Up to floor ${floor}`, prompt: "[F] Climb up", ...stairsUp });
      if (stairsDown) list.push({ kind: "stairsDown", name: `Down to floor ${floor + 2} of ${floors}`, prompt: "[F] Descend", ...stairsDown });
      if (chest) {
        const looted = this.dungeonStatus(id).chest !== null;
        list.push({ kind: "chest", name: "Treasure", prompt: looted ? "[F] Look inside" : "[F] Open chest", ...chest });
      }
      if (rope) list.push({ kind: "rope", name: "Escape rope", prompt: "[F] Climb to the surface", ...rope });
      return list;
    }
    const list = VILLAGE_NPCS.map((npc) => ({ ...npc, prompt: npc.kind === "stash" ? "[F] Open" : "[F] Talk" }));
    for (const s of this.structures) {
      const def = STRUCTURES[s.kind];
      list.push({ kind: "structure", id: s.kind, structure: s, name: `${def.name} · Lv ${s.level}`, prompt: "[F] Use", tx: s.tx, ty: s.ty, w: def.w });
    }
    if (this.grave) {
      list.push({ kind: "grave", name: "Your grave", prompt: "[F] Recover gear", tx: Math.floor(this.grave.x / T), ty: Math.floor(this.grave.y / T) });
    }
    const entrance = dungeonForTile(this.world.seed, this.player.tileX, this.player.tileY);
    if (entrance) {
      const cleared = this.dungeonStatus(entrance.id).cleared;
      list.push({
        kind: "entrance",
        name: `Dungeon · Lv ${entrance.level}`,
        prompt: `[F] Enter${cleared ? " (looted)" : ""}`,
        tx: entrance.tx,
        ty: entrance.ty,
        entrance,
      });
    }
    return list;
  }

  /** The nearest interactable within INTERACT_RANGE, or null. Wide structures count from any of their tiles. */
  nearbyInteractable() {
    const { x, y } = this.player;
    let best = null;
    let bestDistance = INTERACT_RANGE * T;
    for (const it of this.interactables()) {
      for (let dx = 0; dx < (it.w ?? 1); dx++) {
        const d = Math.hypot((it.tx + dx + 0.5) * T - x, (it.ty + 0.5) * T - y);
        if (d <= bestDistance) {
          best = it;
          bestDistance = d;
        }
      }
    }
    return best;
  }

  /** The village NPC within interact range of the player, or null. */
  nearbyNpc() {
    const it = this.nearbyInteractable();
    return VILLAGE_NPCS.find((npc) => npc.id === it?.id) ?? null;
  }

  /** F key. Performs the nearby action; returns a panel id for the UI to open, or null. */
  interact() {
    const it = this.nearbyInteractable();
    if (!it) {
      this.startHarvest();
      return null;
    }
    switch (it.kind) {
      case "npc":
      case "stash":
      case "structure":
        return it.id;
      case "entrance":
        this.enterDungeon(it.entrance);
        return null;
      case "portal":
        this.exitDungeon();
        return null;
      case "stairsDown":
        this.changeFloor(1);
        return null;
      case "stairsUp":
        this.changeFloor(-1);
        return null;
      case "rope":
        this.exitDungeon();
        this.toast("You climb the rope all the way back to the surface.");
        return null;
      case "chest":
        this.openChest();
        return "chest";
      case "grave":
        this.recoverGrave();
        return null;
      default:
        return null;
    }
  }

  // ---- Gathering ------------------------------------------------------------

  /** The tree or rock within reach of the player, nearest first: { tx, ty, node } or null. */
  nearbyNode() {
    if (this.inDungeon) return null;
    const { x, y, tileX, tileY } = this.player;
    let best = null;
    let bestDistance = HARVEST_RANGE * T;
    for (let ty = tileY - 2; ty <= tileY + 2; ty++) {
      for (let tx = tileX - 2; tx <= tileX + 2; tx++) {
        const node = harvestNode(this.world.getTile(tx, ty));
        if (!node) continue;
        const d = Math.hypot((tx + 0.5) * T - x, (ty + 0.5) * T - y);
        if (d <= bestDistance) {
          best = { tx, ty, node };
          bestDistance = d;
        }
      }
    }
    return best;
  }

  /** Starts harvesting the nearest tree or rock (held F does the rest). Returns true if it started. */
  startHarvest() {
    const target = this.nearbyNode();
    if (!target) return false;
    const { tx, ty, node } = target;
    if (!hasTool(this.player.inventory, node.tool)) {
      this.toast(`You need ${node.tool === "axe" ? "an axe" : "a pickaxe"} to harvest this ${node.name}. The General Vendor sells them.`);
      return false;
    }
    this.harvesting = { tx, ty, progress: 0 };
    return true;
  }

  updateHarvest(dt, held) {
    const h = this.harvesting;
    if (!h) return;
    const target = this.nearbyNode();
    if (!held || !target || target.tx !== h.tx || target.ty !== h.ty) {
      this.harvesting = null;
      return;
    }
    h.progress += dt / HARVEST_TIME;
    if (h.progress < 1) return;
    this.harvesting = null;
    const result = harvest(this.player, this.world.getTile(h.tx, h.ty), this.random);
    this.world.harvested.set(`${h.tx},${h.ty}`, this.playTime + NODE_REGROW_TIME);
    const text = `+${result.amount} ${MATERIALS[result.material].name}${result.bonus ? " (bonus!)" : ""}`;
    this.effects.addText((h.tx + 0.5) * T, h.ty * T, text, TextColor.material);
  }

  // Harvested trees and rocks grow back once their time is up, unless the player is standing there.
  updateRegrowth(dt) {
    this.regrowTimer += dt;
    if (this.regrowTimer < REGROW_CHECK_INTERVAL) return;
    this.regrowTimer = 0;
    const { tileX, tileY } = this.player;
    for (const [key, regrowAt] of this.world.harvested) {
      if (regrowAt > this.playTime) continue;
      const [tx, ty] = key.split(",").map(Number);
      if (Math.abs(tx - tileX) <= 1 && Math.abs(ty - tileY) <= 1) continue;
      this.world.harvested.delete(key);
    }
  }

  // ---- Village structures ---------------------------------------------------

  structure(kind) {
    return this.structures.find((s) => s.kind === kind) ?? null;
  }

  /** Tiles a structure of `kind` would cover with its top-left at (tx, ty). */
  footprint(kind, tx, ty) {
    const { w, h } = STRUCTURES[kind];
    const tiles = [];
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) tiles.push({ tx: tx + dx, ty: ty + dy });
    return tiles;
  }

  /**
   * True if `kind` can sit with its top-left at (tx, ty): on village floor inside the walls (not
   * the wall ring, so gates stay open), clear of NPCs, other structures (except `ignore`), and the player.
   */
  canPlace(kind, tx, ty, ignore = null) {
    const inner0 = VILLAGE_ORIGIN + 1;
    const inner1 = VILLAGE_ORIGIN + VILLAGE_SIZE - 2;
    const occupied = new Set(this.structures.filter((s) => s !== ignore).flatMap((s) => this.footprint(s.kind, s.tx, s.ty)).map((p) => `${p.tx},${p.ty}`));
    for (const npc of VILLAGE_NPCS) occupied.add(`${npc.tx},${npc.ty}`);
    const p = this.player;
    const blocksPlayer = (t) => Math.abs((t.tx + 0.5) * T - p.x) < T / 2 + p.half && Math.abs((t.ty + 0.5) * T - p.y) < T / 2 + p.half;
    return this.footprint(kind, tx, ty).every(
      (t) => t.tx >= inner0 && t.tx <= inner1 && t.ty >= inner0 && t.ty <= inner1 && !occupied.has(`${t.tx},${t.ty}`) && !blocksPlayer(t),
    );
  }

  /** Materials still missing to build or upgrade `kind` to `level`: { stone: 12 } or {} if affordable. */
  missingMaterials(kind, level) {
    const missing = {};
    for (const [material, n] of Object.entries(structureCost(kind, level))) {
      if (this.player.materials[material] < n) missing[material] = n - this.player.materials[material];
    }
    return missing;
  }

  /** Builds `kind` at level 1 with its top-left at (tx, ty), or moves the existing one there (free). */
  placeStructure(kind, tx, ty) {
    const existing = this.structure(kind);
    if (!this.canPlace(kind, tx, ty, existing)) {
      this.toast("It doesn't fit there. Pick open village floor away from walls, people, and you.");
      return false;
    }
    if (existing) {
      Object.assign(existing, { tx, ty });
    } else {
      if (Object.keys(this.missingMaterials(kind, 1)).length) {
        this.toast("Not enough materials.");
        return false;
      }
      this.spend(structureCost(kind, 1));
      this.structures.push({ kind, tx, ty, level: 1 });
      this.toast(`${STRUCTURES[kind].name} built.`);
    }
    this.syncStructures();
    this.autosave("build");
    return true;
  }

  /** Upgrades a built structure one level, paying the new level's materials. */
  upgradeStructure(kind) {
    const s = this.structure(kind);
    if (!s) return false;
    if (Object.keys(this.missingMaterials(kind, s.level + 1)).length) {
      this.toast("Not enough materials to upgrade.");
      return false;
    }
    this.spend(structureCost(kind, s.level + 1));
    s.level += 1;
    this.toast(`${STRUCTURES[kind].name} upgraded to level ${s.level}.`);
    this.autosave("build");
    return true;
  }

  spend(materials) {
    for (const [material, n] of Object.entries(materials)) this.player.materials[material] -= n;
  }

  /** Copies structure footprints into the overworld's solid tiles. */
  syncStructures() {
    this.world.structureTiles = new Set(this.structures.flatMap((s) => this.footprint(s.kind, s.tx, s.ty)).map((p) => `${p.tx},${p.ty}`));
  }

  // ---- Enchanting and brewing -----------------------------------------------

  /** A gear piece by location: { where: "equip", key: slot } or { where: "bag", key: index }. */
  gearAt({ where, key }) {
    return where === "equip" ? this.player.equipment[key] : this.player.inventory[Number(key)];
  }

  /** Applies one rune of `stat` to a gear piece at the enchanting table. */
  applyRune(location, stat) {
    const table = this.structure("enchantingTable");
    if (!table) return false;
    const piece = this.gearAt(location);
    const result = applyRune(this.player, piece, stat, table.level);
    if (!result.ok) {
      this.toast(ENCHANT_FAILURES[result.reason]);
      return false;
    }
    this.toast(`${ITEMS[piece.defId].name}: +${RUNE_BONUS} ${stat.toUpperCase()} for ${enchantCost(this.player.level)} g.`);
    return true;
  }

  /** Converts RUNE_CONVERT_RATIO runes of one type into one of another. */
  convertRunes(from, to) {
    if (!this.structure("enchantingTable")) return false;
    const result = convertRunes(this.player, from, to);
    if (!result.ok) this.toast(ENCHANT_FAILURES[result.reason] ?? "You need more of that rune.");
    return result.ok;
  }

  /** Brews one potion at the potion table. */
  craftPotion(kind, level) {
    const table = this.structure("potionTable");
    if (!table) return false;
    const result = craftPotion(this.player, kind, level, table.level, this.newUid);
    if (!result.ok) this.toast(CRAFT_FAILURES[result.reason]);
    return result.ok;
  }

  // ---- Travel potions --------------------------------------------------------

  /** Where a travel potion of `level` can take you: the village, plus visited dungeons up to its level. */
  travelDestinations(level) {
    const list = [{ id: "village", name: "Village" }];
    for (const [id, status] of this.dungeonState) {
      if (!status.visited) continue;
      const [cellX, cellY] = id.split("_").map(Number);
      const entrance = dungeonForCell(this.world.seed, cellX, cellY);
      if (entrance && entrance.level <= level) list.push({ id, name: `Dungeon · Lv ${entrance.level}${status.cleared ? " (looted)" : ""}`, entrance });
    }
    return list;
  }

  /** Drinks a travel potion of type `defId` to go to a destination from travelDestinations. */
  travel(defId, destinationId) {
    const level = ITEMS[defId].level;
    const destination = this.travelDestinations(level).find((d) => d.id === destinationId);
    if (!destination || !takeItem(this.player.inventory, defId, 1)) return false;
    if (this.inDungeon) this.exitDungeon({ toVillage: destination.id === "village" });
    if (destination.entrance) this.player.teleport((destination.entrance.tx + 0.5) * T, (destination.entrance.ty + 1.5) * T);
    else this.player.teleport(VILLAGE_SPAWN.x, VILLAGE_SPAWN.y);
    for (const enemy of this.enemies) enemy.calmDown();
    this.wasSafe = this.isPlayerSafe();
    this.toast(`You drink the potion and arrive at the ${destination.name.toLowerCase().startsWith("dungeon") ? "dungeon entrance" : "village"}.`);
    this.autosave("travel");
    return true;
  }

  // ---- Dungeons -----------------------------------------------------------

  dungeonStatus(id) {
    if (!this.dungeonState.has(id)) this.dungeonState.set(id, { cleared: false, chest: null, visited: false });
    return this.dungeonState.get(id);
  }

  /** Whether a dungeon visit has a boss: 30% from level 5, always until the player has killed one. */
  rollBoss(level) {
    if (level < BOSS_FROM_LEVEL) return null;
    if (this.flags.seenBoss && this.random() >= BOSS_CHANCE) return null;
    return BOSSES[Math.floor(this.random() * BOSSES.length)];
  }

  /**
   * Starts a dungeon visit at `floor` (0 = the top). Every visit restocks the enemies and may
   * have a boss; only the chest stays looted. `silent` skips the toast and autosave (used when
   * restoring a save made inside a dungeon).
   */
  enterDungeon(entrance, { silent = false, floor = 0 } = {}) {
    this.overworldEnemies = this.enemies;
    this.visit = { entrance, floor: 0, floors: new Map(), boss: this.rollBoss(entrance.level), bossKilled: false };
    const status = this.dungeonStatus(entrance.id);
    status.visited = true;
    this.loadFloor(Math.min(Math.max(0, floor), floorsFor(entrance.level) - 1), "arrival");
    this.wasSafe = false;
    if (silent) return;
    const floors = this.area.floors;
    const extra = floors > 1 ? ` ${floors} floors deep.` : "";
    this.toast(`Entered a level ${entrance.level} dungeon${status.cleared ? " (already looted)" : ""}.${extra} The treasure lies in the farthest room.`);
    if (this.visit.boss) this.toast("Something big stirs in the deepest room…");
    this.autosave("dungeon");
  }

  /** Switches to a floor of the current visit, generating it the first time. */
  loadFloor(floor, arriveAt) {
    const visit = this.visit;
    let state = visit.floors.get(floor);
    if (!state) {
      const area = generateDungeon(this.world.seed, visit.entrance, floor);
      const enemies = area.enemySpawns.map((spawn) => new Enemy(enemyAtLevel(spawn.type, area.level), spawn, this.random));
      if (area.isLastFloor && visit.boss && !visit.bossKilled) {
        enemies.push(new Enemy(enemyAtLevel(visit.boss, area.level), { id: `${area.id}:boss`, ...area.bossSpawn }, this.random));
      }
      state = { area, enemies, fog: new Fog() };
      visit.floors.set(floor, state);
    }
    visit.floor = floor;
    this.area = state.area;
    this.enemies = state.enemies;
    this.dungeonFog = state.fog;
    this.projectiles = [];
    const at = arriveAt === "arrival" ? state.area.start : state.area.belowStairsDown;
    this.player.teleport(at.x, at.y);
    this.lastRevealKey = null; // new floor: reveal even if we're standing where we did last time
    this.revealAroundPlayer();
  }

  /** Stairs: +1 goes down a floor, −1 back up. Saves, so a reload resumes on the new floor. */
  changeFloor(delta) {
    if (!this.visit) return;
    const target = this.visit.floor + delta;
    if (target < 0 || target >= this.area.floors) return;
    this.loadFloor(target, delta > 0 ? "arrival" : "stairsDown");
    this.toast(`Floor ${target + 1} of ${this.area.floors}${this.area.isLastFloor ? ": the treasure room is somewhere here" : ""}.`);
    this.autosave("dungeon");
  }

  /** Returns to the overworld, just south of the dungeon's entrance (or to the village). */
  exitDungeon({ toVillage = false } = {}) {
    if (!this.inDungeon) return;
    const { entrance } = this.area;
    this.area = this.world;
    this.visit = null;
    this.enemies = this.overworldEnemies ?? [];
    this.overworldEnemies = null;
    this.projectiles = [];
    if (toVillage) this.player.teleport(VILLAGE_SPAWN.x, VILLAGE_SPAWN.y);
    else this.player.teleport((entrance.tx + 0.5) * T, (entrance.ty + 1.5) * T);
    this.wasSafe = this.isPlayerSafe();
    if (!toVillage) this.autosave("dungeon");
  }

  /** Rolls the chest's loot on first open (it's saved from then on) and marks the dungeon cleared. */
  openChest() {
    const status = this.dungeonStatus(this.area.id);
    if (status.chest) return status.chest;
    status.chest = rollChestLoot(this.area.level, this.random, { boss: this.visit?.bossKilled ?? false });
    status.cleared = true;
    this.autosave("chest");
    return status.chest;
  }

  /** The current dungeon's opened chest contents, or null. */
  get chestContents() {
    return this.inDungeon && this.area.chest ? this.dungeonStatus(this.area.id).chest : null;
  }

  /** Takes gold and as many items as fit; anything left stays in the chest. Returns true if all fit. */
  takeAllFromChest() {
    const chest = this.chestContents;
    if (!chest) return false;
    this.player.gold += chest.gold;
    chest.gold = 0;
    for (let i = chest.items.length - 1; i >= 0; i--) this.takeFromChest(i, { quiet: true });
    if (chest.items.length) this.toast("Inventory full: the rest stays in the chest");
    return chest.items.length === 0;
  }

  takeFromChest(index, { quiet = false } = {}) {
    const chest = this.chestContents;
    const entry = chest?.items[index];
    if (!entry) return false;
    if (entry.arrows) {
      const room = MAX_ARROWS - this.player.arrows;
      const moved = Math.min(room, entry.arrows);
      this.player.arrows += moved;
      entry.arrows -= moved;
      if (entry.arrows === 0) chest.items.splice(index, 1);
      else if (!quiet) this.toast("Your quiver is full");
      return moved > 0;
    }
    const leftover = addItem(this.player.inventory, entry.defId, entry.qty, this.newUid);
    const moved = entry.qty - leftover;
    entry.qty = leftover;
    if (leftover === 0) chest.items.splice(index, 1);
    else if (!quiet) this.toast("Inventory full");
    return moved > 0;
  }

  // ---- Items and economy --------------------------------------------------

  /** Drinks one potion of type `defId` (from the quick wheel or the inventory), with feedback. Returns a panel id for travel potions. */
  drinkPotion(defId) {
    const def = ITEMS[defId];
    if (def.potion === "travel") return countItem(this.player.inventory, defId) ? "travel" : null;
    const result = drinkPotion(this.player, defId);
    if (result.ok) {
      const color = def.resource === "hp" ? TextColor.heal : TextColor.mana;
      this.effects.addText(this.player.x, this.player.y - this.player.half, `+${result.restored}`, color);
    } else if (result.reason === "none") {
      this.toast(`You have no ${def.name}s`);
    } else if (result.reason === "full") {
      this.toast(def.resource === "hp" ? "Already at full health" : "Already at full mana");
    } else if (result.reason === "cooldown") {
      this.toast("Potions are on cooldown");
    }
    return null;
  }

  equip(inventoryIndex) {
    const ok = equipFromInventory(this.player, inventoryIndex);
    this.player.clampResources();
    return ok;
  }

  /** Equips a bag item into a specific slot (drag and drop); explains a wrong slot. */
  equipToSlot(inventoryIndex, slot) {
    const instance = this.player.inventory[inventoryIndex];
    const result = equipToSlot(this.player, inventoryIndex, slot);
    if (result.reason === "wrong-slot") {
      const def = ITEMS[instance.defId];
      this.toast(`${def.name} goes in the ${SLOT_NAMES[def.slot]} slot, not ${SLOT_NAMES[slot]}.`);
    } else if (result.reason === "not-equippable") {
      this.toast(`${ITEMS[instance.defId].name} can't be equipped.`);
    }
    this.player.clampResources();
    return result.ok;
  }

  /** Takes off an equipped piece, into `bagIndex` if it's free. */
  unequip(slot, bagIndex = null) {
    if (unequip(this.player, slot, bagIndex)) {
      this.player.clampResources();
      return true;
    }
    if (this.player.equipment[slot]) this.toast("Inventory full");
    return false;
  }

  moveInBag(from, to) {
    return moveInBag(this.player.inventory, from, to);
  }

  /** Fills any empty weapon slot with a fresh starter weapon. */
  equipStarterWeapons() {
    for (const [slot, defId] of Object.entries(STARTER_WEAPONS)) {
      if (!this.player.equipment[slot]) this.player.equipment[slot] = { uid: this.newUid(), defId, qty: 1 };
    }
  }

  /** Buys one entry from a vendor's current stock list (see vendorStock). */
  buy(vendorId, entryIndex) {
    const entry = vendorStock(vendorId, this.player)[entryIndex];
    if (!entry) return false;
    const result = buyEntry(this.player, entry, this.newUid);
    if (!result.ok) this.toast(PURCHASE_FAILURES[result.reason]);
    return result.ok;
  }

  /** Sells one item from an inventory slot. */
  sell(inventoryIndex) {
    return sellFromSlot(this.player, inventoryIndex, this.buyback) > 0;
  }

  buyBack(index) {
    const result = repurchase(this.player, this.buyback, index, this.newUid);
    if (!result.ok) this.toast(PURCHASE_FAILURES[result.reason]);
    return result.ok;
  }

  /** Moves a whole stack from the inventory into the stash. */
  stashDeposit(inventoryIndex) {
    return this.moveStack(this.player.inventory, inventoryIndex, this.stash.items, "Stash full");
  }

  /** Moves a whole stack from the stash into the inventory. */
  stashWithdraw(stashIndex) {
    return this.moveStack(this.stash.items, stashIndex, this.player.inventory, "Inventory full");
  }

  /** Moves every bag stack into the stash. Gold is separate (depositGold). Returns stacks moved. */
  stashDepositAll() {
    return this.moveAllStacks(this.player.inventory, this.stash.items, "Stash full: some items stayed in your bag");
  }

  /** Moves every stash stack into the bag. Gold is separate (withdrawGold). Returns stacks moved. */
  stashWithdrawAll() {
    return this.moveAllStacks(this.stash.items, this.player.inventory, "Inventory full: some items stayed in the stash");
  }

  moveAllStacks(from, to, fullMessage) {
    let moved = 0;
    for (let i = 0; i < from.length; i++) {
      if (from[i] && this.moveStack(from, i, to, null)) moved++;
    }
    if (from.some(Boolean)) this.toast(fullMessage);
    return moved;
  }

  /** Moves one stack (partially, if only some fits). `fullMessage` is toasted when nothing fits; null to stay quiet. */
  moveStack(from, index, to, fullMessage) {
    const instance = from[index];
    if (!instance) return false;
    const leftover = addInstance(to, instance, this.newUid);
    if (leftover === instance.qty) {
      if (fullMessage) this.toast(fullMessage);
      return false;
    }
    if (leftover === 0) from[index] = null;
    else instance.qty = leftover;
    return true;
  }

  depositGold(amount) {
    const moved = Math.min(amount, this.player.gold);
    this.player.gold -= moved;
    this.stash.gold += moved;
    return moved;
  }

  withdrawGold(amount) {
    const moved = Math.min(amount, this.stash.gold);
    this.stash.gold -= moved;
    this.player.gold += moved;
    return moved;
  }

  // ---- Progression --------------------------------------------------------

  /** Commits pending stat points from the character sheet. */
  allocateStats(pending) {
    return allocatePoints(this.player, pending);
  }

  /** Buys a respec from the trainer; toasts the outcome. */
  buyRespec() {
    const cost = respecCost(this.player.level);
    if (!respec(this.player)) {
      this.toast(`A respec costs ${cost} g. You have ${this.player.gold} g.`);
      return false;
    }
    this.toast(`Stats reset for ${cost} g. ${this.player.unspentPoints} points to spend.`);
    return true;
  }

  // ---- Death --------------------------------------------------------------

  /**
   * Souls-style death: armor, bag, and arrows drop into a grave (outside the entrance if
   * you died in a dungeon). Only one grave exists; dying again destroys the old one.
   * You respawn in the village with full HP/mana, your gold, and fresh starter weapons.
   */
  onPlayerDeath() {
    const player = this.player;
    const where = this.inDungeon
      ? { x: (this.area.entrance.tx + 0.5) * T, y: (this.area.entrance.ty + 1.5) * T }
      : { x: player.x, y: player.y };
    const lostPrevious = this.grave !== null;
    const grave = { ...where, ...buryGear(player) };
    this.grave = isGraveEmpty(grave) ? null : grave;
    this.equipStarterWeapons(); // never respawn helpless
    this.harvesting = null;

    this.exitDungeon({ toVillage: true });
    player.teleport(VILLAGE_SPAWN.x, VILLAGE_SPAWN.y);
    const stats = totalStats(player);
    player.hp = maxHp(stats);
    player.mana = maxMana(stats);
    player.iframes = RESPAWN_IFRAMES;
    player.lastCombatTime = -Infinity;
    this.projectiles = [];
    for (const enemy of this.enemies) enemy.calmDown();
    this.wasSafe = true;

    if (lostPrevious) this.toast("Your previous grave was lost, along with everything in it.");
    this.toast(this.grave ? "You died! Your gear lies in a grave where you fell. Go get it back." : "You died!");
    this.autosave("death");
  }

  /** Pulls everything that fits out of the grave; it disappears once empty. */
  recoverGrave() {
    if (!this.grave) return false;
    const emptied = recoverGrave(this.player, this.grave, this.newUid);
    if (emptied) {
      this.grave = null;
      this.toast("Grave recovered. Your gear is back.");
    } else {
      this.toast("Inventory full: some items remain in your grave");
    }
    this.player.clampResources();
    this.autosave("grave");
    return emptied;
  }

  // ---- Events -------------------------------------------------------------

  toast(text) {
    this.events.push({ type: "toast", text });
  }

  autosave(reason) {
    this.events.push({ type: "autosave", reason });
  }
}
