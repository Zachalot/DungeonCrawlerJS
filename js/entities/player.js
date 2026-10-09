import {
  INVENTORY_SIZE,
  PLAYER_SIZE,
  PLAYER_SPEED,
  STARTING_ARROWS,
  STARTING_GOLD,
  STARTING_STATS,
  TILE_SIZE,
} from "../config.js";
import { MATERIAL_TYPES, RUNE_TYPES } from "../data/enemies.js";
import { createEquipment, createSlots, totalArmor } from "../systems/inventory.js";
import { maxHp, maxMana, totalStats } from "../systems/stats.js";
import { moveAndCollide } from "../world/collision.js";

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.half = (PLAYER_SIZE * TILE_SIZE) / 2;
    this.aimAngle = 0;

    this.level = 1;
    this.xp = 0; // progress toward the next level
    this.unspentPoints = 0;
    this.gold = STARTING_GOLD;
    this.stats = { ...STARTING_STATS };
    this.hp = maxHp(this.stats);
    this.mana = maxMana(this.stats);
    this.arrows = STARTING_ARROWS;
    this.inventory = createSlots(INVENTORY_SIZE);
    this.equipment = createEquipment();
    this.materials = Object.fromEntries(MATERIAL_TYPES.map((id) => [id, 0])); // pouch: wood, stone, goop
    this.runes = Object.fromEntries(RUNE_TYPES.map((id) => [id, 0])); // boss runes, by stat
    this.harvests = 0; // trees and rocks harvested: the Gathering skill
    this.wheelLevels = {}; // potion level the quick wheel uses, by kind (unset = highest carried)
    this.potionCooldown = 0; // s until another potion can be drunk

    this.weapon = "sword";
    this.attackCooldown = 0; // s until the next attack is allowed
    this.attackBuffer = 0; // s a recent click keeps waiting for the cooldown
    this.iframes = 0; // s of remaining invulnerability
    this.flash = 0; // s of remaining hit flash
    this.lastCombatTime = -Infinity;
    this.regenRemainder = { hp: 0, mana: 0 };
  }

  /** Advances movement and aim one fixed step; `move` is a direction vector, `aim` a world-px point. */
  update(dt, move, aim, world) {
    this.prevX = this.x;
    this.prevY = this.y;

    const length = Math.hypot(move.x, move.y);
    if (length > 0) {
      const step = PLAYER_SPEED * TILE_SIZE * dt;
      moveAndCollide(world, this, (move.x / length) * step, (move.y / length) * step);
    }
    this.aimAngle = Math.atan2(aim.y - this.y, aim.x - this.x);
  }

  /** Position interpolated between the last two fixed steps. */
  renderPosition(alpha) {
    return {
      x: this.prevX + (this.x - this.prevX) * alpha,
      y: this.prevY + (this.y - this.prevY) * alpha,
    };
  }

  /** Moves to a point without interpolating from the old position. */
  teleport(x, y) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
  }

  /** Total armor from equipped pieces. */
  get armor() {
    return totalArmor(this.equipment);
  }

  /** Stats including the runes on equipped gear. */
  get totalStats() {
    return totalStats(this);
  }

  /** Keeps HP and mana within their maximums (after gear with runes comes off, for example). */
  clampResources() {
    const stats = totalStats(this);
    this.hp = Math.min(this.hp, maxHp(stats));
    this.mana = Math.min(this.mana, maxMana(stats));
  }

  get tileX() {
    return Math.floor(this.x / TILE_SIZE);
  }

  get tileY() {
    return Math.floor(this.y / TILE_SIZE);
  }
}
