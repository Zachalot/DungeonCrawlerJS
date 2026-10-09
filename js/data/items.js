import {
  HP_POTION_BASE,
  HP_POTION_PER_LEVEL,
  MANA_POTION_PER_LEVEL,
  MAX_ITEM_LEVEL,
  POTION_PRICE_PER_LEVEL,
  TRAVEL_POTION_PRICE_PER_LEVEL,
} from "../config.js";

// Item definitions. Instances in inventories are { uid, defId, qty, enchants? }; only instances
// are saved. sellPrice is floor(buyPrice × 0.5) unless an item overrides it. Gear instances can
// carry `enchants: { str: 2, … }` (runes applied at the enchanting table).

export const ARMOR_SLOTS = Object.freeze(["helmet", "chest", "legs", "gloves", "boots"]);
/** Weapon slots share ids with the weapon kinds in data/weapons.js. */
export const WEAPON_SLOTS = Object.freeze(["sword", "bow", "staff"]);
export const EQUIP_SLOTS = Object.freeze([...ARMOR_SLOTS, ...WEAPON_SLOTS]);

export const SLOT_NAMES = Object.freeze({
  helmet: "Helmet",
  chest: "Chest",
  legs: "Legs",
  gloves: "Gloves",
  boots: "Boots",
  sword: "Sword",
  bow: "Bow",
  staff: "Staff",
});

const TIERS = {
  leather: { name: "Leather", armor: { helmet: 2, chest: 5, legs: 3, gloves: 1, boots: 1 }, price: { helmet: 10, chest: 25, legs: 15, gloves: 5, boots: 5 } },
  iron: { name: "Iron", armor: { helmet: 4, chest: 10, legs: 7, gloves: 3, boots: 3 }, price: { helmet: 35, chest: 80, legs: 55, gloves: 20, boots: 20 } },
  // Chest-only tier: never sold by vendors, but vendors buy it at 50%.
  steel: { name: "Steel", armor: { helmet: 7, chest: 16, legs: 11, gloves: 5, boots: 5 }, price: { helmet: 120, chest: 300, legs: 200, gloves: 100, boots: 100 } },
};

const ARMOR_NAMES = {
  helmet: "Helmet",
  chest: "Chestpiece",
  legs: "Leggings",
  gloves: "Gloves",
  boots: "Boots",
};

function armorItems() {
  const items = {};
  for (const [tierId, tier] of Object.entries(TIERS)) {
    for (const slot of ARMOR_SLOTS) {
      const id = `${tierId}_${slot}`;
      items[id] = item({
        id,
        name: `${tier.name} ${ARMOR_NAMES[slot]}`,
        type: "armor",
        tier: tierId,
        slot,
        armor: tier.armor[slot],
        buyPrice: tier.price[slot],
      });
    }
  }
  return items;
}

function item(fields) {
  return Object.freeze({
    slot: null,
    tier: null,
    armor: 0,
    weaponBonus: 0, // flat damage added to a weapon's stat-based damage
    stats: {}, // reserved for secondary bonuses, e.g. { end: 1 }
    stackable: false,
    maxStack: 1,
    sellPrice: Math.floor(fields.buyPrice * 0.5),
    ...fields,
  });
}

/**
 * A weapon for one of the three weapon slots. Damage is the slot's stat formula
 * (data/weapons.js) plus weaponBonus. Starter weapons sell for nothing, so dying
 * (which hands out fresh ones) can't be farmed for gold.
 */
function weapon(id, name, slot, { tier, weaponBonus = 0, buyPrice, sellPrice }) {
  return item({ id, name, type: "weapon", tier, slot, weaponBonus, buyPrice, ...(sellPrice === undefined ? {} : { sellPrice }) });
}

/** Potion kinds. Each comes in levels 1..MAX_ITEM_LEVEL. */
export const POTION_KINDS = Object.freeze({
  hp: { name: "Health Potion", resource: "hp", price: POTION_PRICE_PER_LEVEL },
  mana: { name: "Mana Potion", resource: "mana", price: POTION_PRICE_PER_LEVEL },
  travel: { name: "Travel Potion", resource: "travel", price: TRAVEL_POTION_PRICE_PER_LEVEL },
});

/** Item id of a potion; levels past MAX_ITEM_LEVEL use the highest one. */
export function potionId(kind, level) {
  return `${kind}_potion_${Math.min(Math.max(1, level), MAX_ITEM_LEVEL)}`;
}

/** Amount a level N health or mana potion restores. */
export function potionAmount(kind, level) {
  return kind === "hp" ? HP_POTION_BASE + HP_POTION_PER_LEVEL * (level - 1) : MANA_POTION_PER_LEVEL * level;
}

function potionItems() {
  const items = {};
  for (const [kind, { name, resource, price }] of Object.entries(POTION_KINDS)) {
    for (let level = 1; level <= MAX_ITEM_LEVEL; level++) {
      const id = potionId(kind, level);
      items[id] = item({
        id,
        name: `${name} (Lv ${level})`,
        type: "consumable",
        potion: kind,
        resource,
        level,
        amount: kind === "travel" ? 0 : potionAmount(kind, level),
        stackable: true,
        maxStack: 20,
        buyPrice: price * level,
      });
    }
  }
  return items;
}

function tool(id, name, toolKind) {
  return item({ id, name, type: "tool", tool: toolKind, tier: "starter", buyPrice: 10 });
}

export const ITEMS = Object.freeze({
  ...armorItems(),
  starter_sword: weapon("starter_sword", "Starter Sword", "sword", { tier: "starter", buyPrice: 5, sellPrice: 0 }),
  starter_bow: weapon("starter_bow", "Starter Bow", "bow", { tier: "starter", buyPrice: 5, sellPrice: 0 }),
  starter_staff: weapon("starter_staff", "Starter Staff", "staff", { tier: "starter", buyPrice: 5, sellPrice: 0 }),
  starter_axe: tool("starter_axe", "Axe", "axe"),
  starter_pickaxe: tool("starter_pickaxe", "Pickaxe", "pickaxe"),
  ...potionItems(),
});

/** Quick-select wheel segments, clockwise from the top: one per potion kind. */
export const QUICK_WHEEL_KINDS = Object.freeze(["hp", "mana", "travel"]);

/** Weapons a new character starts with equipped, and is re-armed with after dying. */
export const STARTER_WEAPONS = Object.freeze({ sword: "starter_sword", bow: "starter_bow", staff: "starter_staff" });

export const STARTING_ITEMS = Object.freeze([
  { defId: potionId("hp", 1), qty: 2 },
  { defId: potionId("mana", 1), qty: 2 },
]);
