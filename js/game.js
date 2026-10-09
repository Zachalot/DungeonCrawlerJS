import {
  ATTACK_BUFFER_TIME,
  INTERACT_RANGE,
  MAX_ARROWS,
  OUT_OF_COMBAT_DELAY,
  PLAYER_IFRAMES,
  RESPAWN_IFRAMES,
  STASH_SIZE,
  TILE_SIZE,
} from "./config.js";
import { ENEMIES } from "./data/enemies.js";
import { STARTING_ITEMS } from "./data/items.js";
import { VENDORS } from "./data/vendors.js";
import { WEAPONS } from "./data/weapons.js";
import { Player } from "./entities/player.js";
import { Projectile } from "./entities/projectile.js";
import { Zombie } from "./entities/zombie.js";
import { isInArc, mitigate } from "./systems/combat.js";
import { drinkBestPotion } from "./systems/consumables.js";
import { buryGear, isGraveEmpty, recoverGrave } from "./systems/death.js";
import { buyEntry, repurchase, sellFromSlot } from "./systems/economy.js";
import { Effects } from "./systems/effects.js";
import { addInstance, addItem, createSlots, equipFromInventory, unequip } from "./systems/inventory.js";
import { allocatePoints, grantXp, respec, respecCost } from "./systems/leveling.js";
import { collectDrops, rollChestLoot, rollDrops } from "./systems/loot.js";
import { applyRegen } from "./systems/regen.js";
import { Spawner } from "./systems/spawner.js";
import { maxHp, maxMana, weaponDamage } from "./systems/stats.js";
import { hasLineOfSight, moveAndCollide } from "./world/collision.js";
import { generateDungeon } from "./world/dungeon.js";
import { dungeonForTile } from "./world/dungeons.js";
import { VILLAGE_NPCS, VILLAGE_SPAWN } from "./world/village.js";
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
});

const PURCHASE_FAILURES = {
  gold: "Not enough gold",
  space: "Inventory full",
  quiver: "Your quiver is full",
  missing: "That item is gone",
};

/**
 * The simulation, independent of the DOM. Call update() once per fixed step with the
 * current controls; the UI reads state and drains `events` ({ type: "toast" | "autosave" }).
 *
 * The player is always in one "area": the overworld (`world`) or a dungeon. Both expose
 * getTileInfo / isSolidAt / isSafeZone / widthPx / heightPx.
 */
export class Game {
  constructor(seed, { random = Math.random } = {}) {
    this.random = random;
    this.world = new World(seed);
    this.area = this.world;
    this.player = new Player(VILLAGE_SPAWN.x, VILLAGE_SPAWN.y);
    this.zombies = [];
    this.projectiles = [];
    this.effects = new Effects();
    this.spawner = new Spawner(this.world, ENEMIES.zombie_l1, random);
    this.events = [];
    this.time = 0;
    this.view = null; // camera rect in px, set by the renderer each frame

    this.nextUid = 1;
    this.newUid = () => `i${this.nextUid++}`;
    this.stash = { gold: 0, items: createSlots(STASH_SIZE) };
    this.buyback = []; // recently sold items; not saved
    for (const { defId, qty } of STARTING_ITEMS) addItem(this.player.inventory, defId, qty, this.newUid);

    this.dungeonState = new Map(); // dungeon id → { cleared, chest: { gold, items } | null }
    this.overworldZombies = null; // parked while the player is in a dungeon
    this.wasSafe = true;
    this.grave = null; // { x, y, equipment, items, arrows }; at most one
    this.playTime = 0; // s, unpaused

    // Zombies treat the village as solid so they can never enter it.
    this.zombieSolids = {
      isSolidAt: (tx, ty) => this.area.isSolidAt(tx, ty) || this.area.isSafeZone(tx, ty),
    };
  }

  get inDungeon() {
    return this.area.kind === "dungeon";
  }

  /**
   * `controls`: { move: {x, y}, aim: {x, y} world px, attack: held bool,
   * attackPressed: bool (a click/press since the last step), weapon: id | null }.
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
    this.updateZombies(dt);
    this.effects.update(dt);

    const safe = this.isPlayerSafe();
    if (safe && !this.wasSafe) this.autosave("village");
    this.wasSafe = safe;

    applyRegen(player, dt, { inVillage: safe, inCombat: this.isInCombat() });
    if (!this.inDungeon) this.spawner.update(dt, this.time, player, this.zombies, this.view);

    if (player.hp <= 0) this.onPlayerDeath();
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
    player.attackCooldown = weapon.cooldown;

    if (weapon.kind === "melee") {
      this.swingSword(weapon);
      return;
    }
    if (weapon.arrowCost && player.arrows < weapon.arrowCost) {
      this.toast("No arrows!");
      return;
    }
    if (weapon.manaCost && player.mana < weapon.manaCost) {
      this.toast("Not enough mana");
      return;
    }
    player.arrows -= weapon.arrowCost ?? 0;
    player.mana -= weapon.manaCost ?? 0;

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
        damage: weaponDamage(weapon, player.stats),
      }),
    );
  }

  swingSword(weapon) {
    const player = this.player;
    const arc = (weapon.arcDegrees * Math.PI) / 180;
    const damage = weaponDamage(weapon, player.stats);
    this.effects.addSwing(player.x, player.y, player.aimAngle, weapon.range * T, arc);

    for (const zombie of this.zombies) {
      if (zombie.dead) continue;
      if (!isInArc(player.x, player.y, player.aimAngle, arc, weapon.range * T + zombie.half, zombie.x, zombie.y)) continue;
      const away = Math.atan2(zombie.y - player.y, zombie.x - player.x);
      this.damageZombie(zombie, damage, away, weapon.knockback);
    }
  }

  damageZombie(zombie, damage, knockbackAngle = null, knockbackTiles = 0) {
    this.player.lastCombatTime = this.time;
    this.effects.addText(zombie.x, zombie.y - zombie.half, String(damage), TextColor.dealt);
    if (zombie.takeHit(damage, knockbackAngle, knockbackTiles)) {
      this.effects.addPuff(zombie.x, zombie.y, "#6b8f5e");
      // Dungeon zombies stay dead for the rest of the visit; overworld ones respawn on a timer.
      if (!this.inDungeon) this.spawner.onZombieKilled(zombie, this.time);
      this.rewardKill(zombie);
    }
  }

  rewardKill(zombie) {
    const player = this.player;
    const drops = rollDrops(zombie.def.dropTable, this.random);
    collectDrops(player, drops);
    const rewards = [`+${zombie.def.xp} XP`];
    if (drops.gold) rewards.push(`+${drops.gold} g`);
    if (drops.arrows) rewards.push(`+${drops.arrows} arrows`);
    this.effects.addText(zombie.x, zombie.y - zombie.half - 14, rewards.join("  "), TextColor.reward);

    const levels = grantXp(player, zombie.def.xp);
    if (levels > 0) {
      this.effects.addText(player.x, player.y - player.half - 14, "LEVEL UP!", TextColor.levelUp);
      this.toast(`Level up! You are level ${player.level}. Press C to spend ${player.unspentPoints} stat points.`);
    }
  }

  /** Applies armor and i-frames; returns the damage actually taken. */
  damagePlayer(rawDamage) {
    const player = this.player;
    if (player.iframes > 0) return 0;
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
      const hit = projectile.update(dt, this.area, this.zombies);
      if (hit) this.damageZombie(hit, projectile.damage);
      if (projectile.dead) this.effects.addPuff(projectile.x, projectile.y, projectile.kind === "fireball" ? "#f97316" : "#d6c7a1");
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  updateZombies(dt) {
    const ctx = {
      player: this.player,
      playerSafe: this.isPlayerSafe(),
      canSee: (x0, y0, x1, y1) => hasLineOfSight(this.area, x0, y0, x1, y1),
      solids: this.zombieSolids,
      onAttack: (zombie) => this.damagePlayer(zombie.def.damage),
    };
    this.zombies = this.zombies.filter((z) => !z.dead);
    for (const zombie of this.zombies) zombie.update(dt, ctx);
    this.separateZombies();
  }

  // Pushes overlapping zombies apart so packs don't stack into one sprite.
  separateZombies() {
    const zs = this.zombies;
    for (let i = 0; i < zs.length; i++) {
      for (let j = i + 1; j < zs.length; j++) {
        const a = zs[i];
        const b = zs[j];
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
        moveAndCollide(this.zombieSolids, a, (-dx / distance) * push, (-dy / distance) * push);
        moveAndCollide(this.zombieSolids, b, (dx / distance) * push, (dy / distance) * push);
      }
    }
  }

  // ---- Interaction --------------------------------------------------------

  /** Everything the player could interact with in the current area: [{ kind, name, prompt, tx, ty, ... }]. */
  interactables() {
    if (this.inDungeon) {
      const { portal, chest, id } = this.area;
      const looted = this.dungeonStatus(id).chest !== null;
      return [
        { kind: "portal", name: "Exit", prompt: "[F] Leave dungeon", ...portal },
        { kind: "chest", name: "Treasure", prompt: looted ? "[F] Look inside" : "[F] Open chest", ...chest },
      ];
    }
    const list = VILLAGE_NPCS.map((npc) => ({ ...npc, prompt: npc.kind === "stash" ? "[F] Open" : "[F] Talk" }));
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

  /** The nearest interactable within INTERACT_RANGE, or null. */
  nearbyInteractable() {
    const { x, y } = this.player;
    let best = null;
    let bestDistance = INTERACT_RANGE * T;
    for (const it of this.interactables()) {
      const d = Math.hypot((it.tx + 0.5) * T - x, (it.ty + 0.5) * T - y);
      if (d <= bestDistance) {
        best = it;
        bestDistance = d;
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
    if (!it) return null;
    switch (it.kind) {
      case "npc":
      case "stash":
        return it.id;
      case "entrance":
        this.enterDungeon(it.entrance);
        return null;
      case "portal":
        this.exitDungeon();
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

  // ---- Dungeons -----------------------------------------------------------

  dungeonStatus(id) {
    if (!this.dungeonState.has(id)) this.dungeonState.set(id, { cleared: false, chest: null });
    return this.dungeonState.get(id);
  }

  /** `silent` skips the toast and autosave (used when restoring a save made inside a dungeon). */
  enterDungeon(entrance, { silent = false } = {}) {
    const dungeon = generateDungeon(this.world.seed, entrance);
    this.overworldZombies = this.zombies;
    this.area = dungeon;
    // Every visit restocks the zombies; only the chest stays looted.
    this.zombies = dungeon.zombieSpawns.map((spawn) => new Zombie(ENEMIES.zombie_l1, spawn, this.random));
    this.projectiles = [];
    this.player.teleport(dungeon.start.x, dungeon.start.y);
    this.wasSafe = false;
    if (silent) return;
    const cleared = this.dungeonStatus(dungeon.id).cleared;
    this.toast(`Entered a level ${dungeon.level} dungeon${cleared ? " (already looted)" : ""}. The treasure lies in the farthest room.`);
    this.autosave("dungeon");
  }

  /** Returns to the overworld, just south of the dungeon's entrance. */
  exitDungeon({ toVillage = false } = {}) {
    if (!this.inDungeon) return;
    const { entrance } = this.area;
    this.area = this.world;
    this.zombies = this.overworldZombies ?? [];
    this.overworldZombies = null;
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
    status.chest = rollChestLoot(this.random);
    status.cleared = true;
    this.autosave("chest");
    return status.chest;
  }

  /** The current dungeon's opened chest contents, or null. */
  get chestContents() {
    return this.inDungeon ? this.dungeonStatus(this.area.id).chest : null;
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

  /** Q/E: drinks the best potion for "hp" or "mana", with feedback. */
  drinkPotion(resource) {
    const result = drinkBestPotion(this.player, resource);
    const label = resource === "hp" ? "health" : "mana";
    if (result.ok) {
      const color = resource === "hp" ? TextColor.heal : TextColor.mana;
      this.effects.addText(this.player.x, this.player.y - this.player.half, `+${result.restored}`, color);
    } else if (result.reason === "none") {
      this.toast(`No ${label} potions`);
    } else if (result.reason === "full") {
      this.toast(resource === "hp" ? "Already at full health" : "Already at full mana");
    } else if (result.reason === "cooldown") {
      this.toast("Potions are on cooldown");
    }
    return result.ok;
  }

  equip(inventoryIndex) {
    return equipFromInventory(this.player, inventoryIndex);
  }

  unequip(slot) {
    if (unequip(this.player, slot)) return true;
    if (this.player.equipment[slot]) this.toast("Inventory full");
    return false;
  }

  /** Buys one entry from a vendor's stock list. */
  buy(vendorId, entryIndex) {
    const entry = VENDORS[vendorId].stock[entryIndex];
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

  moveStack(from, index, to, fullMessage) {
    const instance = from[index];
    if (!instance) return false;
    const leftover = addInstance(to, instance, this.newUid);
    if (leftover === instance.qty) {
      this.toast(fullMessage);
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
   * You respawn in the village with full HP/mana, your gold, and the starter weapons.
   */
  onPlayerDeath() {
    const player = this.player;
    const where = this.inDungeon
      ? { x: (this.area.entrance.tx + 0.5) * T, y: (this.area.entrance.ty + 1.5) * T }
      : { x: player.x, y: player.y };
    const lostPrevious = this.grave !== null;
    const grave = { ...where, ...buryGear(player) };
    this.grave = isGraveEmpty(grave) ? null : grave;

    this.exitDungeon({ toVillage: true });
    player.teleport(VILLAGE_SPAWN.x, VILLAGE_SPAWN.y);
    player.hp = maxHp(player.stats);
    player.mana = maxMana(player.stats);
    player.iframes = RESPAWN_IFRAMES;
    player.lastCombatTime = -Infinity;
    this.projectiles = [];
    for (const zombie of this.zombies) zombie.calmDown();
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
