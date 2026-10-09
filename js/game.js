import {
  ATTACK_BUFFER_TIME,
  INTERACT_RANGE,
  OUT_OF_COMBAT_DELAY,
  PLAYER_IFRAMES,
  RESPAWN_IFRAMES,
  STASH_SIZE,
  TILE_SIZE,
} from "./config.js";
import { ENEMIES } from "./data/enemies.js";
import { WEAPONS } from "./data/weapons.js";
import { Player } from "./entities/player.js";
import { Projectile } from "./entities/projectile.js";
import { isInArc, mitigate } from "./systems/combat.js";
import { STARTING_ITEMS } from "./data/items.js";
import { VENDORS } from "./data/vendors.js";
import { drinkBestPotion } from "./systems/consumables.js";
import { buyEntry, repurchase, sellFromSlot } from "./systems/economy.js";
import { Effects } from "./systems/effects.js";
import { addInstance, addItem, createSlots, equipFromInventory, unequip } from "./systems/inventory.js";
import { allocatePoints, grantXp, respec, respecCost } from "./systems/leveling.js";
import { collectDrops, rollDrops } from "./systems/loot.js";
import { applyRegen } from "./systems/regen.js";
import { Spawner } from "./systems/spawner.js";
import { maxHp, maxMana, weaponDamage } from "./systems/stats.js";
import { hasLineOfSight, moveAndCollide } from "./world/collision.js";
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
 * Overworld simulation, independent of the DOM. Call update() once per fixed
 * step with the current controls; UI reads state and drains `events`.
 */
export class Game {
  constructor(seed, { random = Math.random } = {}) {
    this.random = random;
    this.world = new World(seed);
    this.player = new Player(VILLAGE_SPAWN.x, VILLAGE_SPAWN.y);
    this.zombies = [];
    this.projectiles = [];
    this.effects = new Effects();
    this.spawner = new Spawner(this.world, ENEMIES.zombie_l1, random);
    this.events = []; // { type: "toast", text }
    this.time = 0;
    this.view = null; // camera rect in px, set by the renderer each frame

    this.nextUid = 1;
    this.newUid = () => `i${this.nextUid++}`;
    this.stash = { gold: 0, items: createSlots(STASH_SIZE) };
    this.buyback = []; // recently sold items; not saved
    for (const { defId, qty } of STARTING_ITEMS) addItem(this.player.inventory, defId, qty, this.newUid);

    // Zombies treat the village as solid so they can never enter it.
    this.zombieSolids = {
      isSolidAt: (tx, ty) => this.world.isSolidAt(tx, ty) || this.world.isSafeZone(tx, ty),
    };
  }

  /**
   * `controls`: { move: {x, y}, aim: {x, y} world px, attack: held bool,
   * attackPressed: bool (a click/press since the last step), weapon: id | null }.
   */
  update(dt, controls) {
    this.time += dt;
    const player = this.player;

    if (controls.weapon && WEAPONS[controls.weapon]) player.weapon = controls.weapon;
    player.update(dt, controls.move, controls.aim, this.world);
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

    applyRegen(player, dt, { inVillage: this.isPlayerSafe(), inCombat: this.isInCombat() });
    this.spawner.update(dt, this.time, player, this.zombies, this.view);

    if (player.hp <= 0) this.respawnPlayer();
  }

  isPlayerSafe() {
    return this.world.isSafeZone(this.player.tileX, this.player.tileY);
  }

  isInCombat() {
    return this.time - this.player.lastCombatTime < OUT_OF_COMBAT_DELAY;
  }

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
      this.spawner.onZombieKilled(zombie, this.time);
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

  /** The village NPC within interact range of the player, or null. */
  nearbyNpc() {
    const player = this.player;
    return (
      VILLAGE_NPCS.find((npc) => Math.hypot((npc.tx + 0.5) * T - player.x, (npc.ty + 0.5) * T - player.y) <= INTERACT_RANGE * T) ??
      null
    );
  }

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
      const hit = projectile.update(dt, this.world, this.zombies);
      if (hit) this.damageZombie(hit, projectile.damage);
      if (projectile.dead) this.effects.addPuff(projectile.x, projectile.y, projectile.kind === "fireball" ? "#f97316" : "#d6c7a1");
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  updateZombies(dt) {
    const ctx = {
      player: this.player,
      playerSafe: this.isPlayerSafe(),
      canSee: (x0, y0, x1, y1) => hasLineOfSight(this.world, x0, y0, x1, y1),
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

  // Placeholder until graves (M6): full restore at the village, no item loss.
  respawnPlayer() {
    const player = this.player;
    player.teleport(VILLAGE_SPAWN.x, VILLAGE_SPAWN.y);
    player.hp = maxHp(player.stats);
    player.mana = maxMana(player.stats);
    player.iframes = RESPAWN_IFRAMES;
    player.lastCombatTime = -Infinity;
    this.projectiles = [];
    for (const zombie of this.zombies) zombie.calmDown();
    this.toast("You died! Respawned in the village.");
  }

  toast(text) {
    this.events.push({ type: "toast", text });
  }
}
