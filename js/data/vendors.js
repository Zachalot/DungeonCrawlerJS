// Vendor stock. Entries are items by id, arrow bundles that go straight to the quiver (priced by
// the player's level), or `potions`: every potion kind at the levels near the player's.

export const VENDORS = Object.freeze({
  potionVendor: {
    name: "Potion Vendor",
    greeting: "Fresh brews! Mind the fumes.",
    buys: false,
    stock: [{ potions: ["hp", "mana", "travel"] }],
  },
  generalVendor: {
    name: "General Vendor",
    greeting: "Arrows, tools, armor, spare starter weapons, and I'll buy whatever you drag back.",
    buys: true,
    stock: [
      { arrows: 20 },
      { item: "starter_axe" },
      { item: "starter_pickaxe" },
      { item: "starter_sword" },
      { item: "starter_bow" },
      { item: "starter_staff" },
      { item: "leather_helmet" },
      { item: "leather_chest" },
      { item: "leather_legs" },
      { item: "leather_gloves" },
      { item: "leather_boots" },
      { item: "iron_helmet" },
      { item: "iron_chest" },
      { item: "iron_legs" },
      { item: "iron_gloves" },
      { item: "iron_boots" },
    ],
  },
});

/** The potion vendor sells each kind at the player's level and the two below it. */
export const POTION_LEVELS_SOLD = 3;

export const BUYBACK_SIZE = 10;
