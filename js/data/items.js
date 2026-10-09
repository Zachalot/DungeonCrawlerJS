// Item definitions. Instances in inventories are { uid, defId, qty }; only instances are saved.
// sellPrice is floor(buyPrice × 0.5) unless an item overrides it.

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

function potion(id, name, resource, effect, buyPrice) {
  return item({ id, name, type: "consumable", resource, effect, stackable: true, maxStack: 20, buyPrice });
}

export const ITEMS = Object.freeze({
  ...armorItems(),
  starter_sword: weapon("starter_sword", "Starter Sword", "sword", { tier: "starter", buyPrice: 5, sellPrice: 0 }),
  starter_bow: weapon("starter_bow", "Starter Bow", "bow", { tier: "starter", buyPrice: 5, sellPrice: 0 }),
  starter_staff: weapon("starter_staff", "Starter Staff", "staff", { tier: "starter", buyPrice: 5, sellPrice: 0 }),
  minor_hp_potion: potion("minor_hp_potion", "Minor Health Potion", "hp", { flat: 25 }, 10),
  minor_mana_potion: potion("minor_mana_potion", "Minor Mana Potion", "mana", { flat: 25 }, 10),
  greater_hp_potion: potion("greater_hp_potion", "Greater Health Potion", "hp", { percent: 0.4 }, 40),
  greater_mana_potion: potion("greater_mana_potion", "Greater Mana Potion", "mana", { percent: 0.4 }, 40),
});

/** Potions grouped by resource, best first. */
export const POTION_PRIORITY = Object.freeze({
  hp: ["greater_hp_potion", "minor_hp_potion"],
  mana: ["greater_mana_potion", "minor_mana_potion"],
});

/** Quick-select wheel segments, clockwise from the top. */
export const QUICK_WHEEL_ITEMS = Object.freeze(["minor_hp_potion", "greater_hp_potion", "greater_mana_potion", "minor_mana_potion"]);

/** Weapons a new character starts with equipped, and is re-armed with after dying. */
export const STARTER_WEAPONS = Object.freeze({ sword: "starter_sword", bow: "starter_bow", staff: "starter_staff" });

export const STARTING_ITEMS = Object.freeze([
  { defId: "minor_hp_potion", qty: 2 },
  { defId: "minor_mana_potion", qty: 2 },
]);
