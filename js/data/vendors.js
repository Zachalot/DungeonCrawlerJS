// Vendor stock. Entries are items by id, or arrow bundles that go straight to the quiver.

export const VENDORS = Object.freeze({
  potionVendor: {
    name: "Potion Vendor",
    greeting: "Fresh brews! Mind the fumes.",
    buys: false,
    stock: [
      { item: "minor_hp_potion" },
      { item: "minor_mana_potion" },
      { item: "greater_hp_potion" },
      { item: "greater_mana_potion" },
    ],
  },
  generalVendor: {
    name: "General Vendor",
    greeting: "Armor, arrows, and I'll buy whatever you drag back.",
    buys: true,
    stock: [
      { arrows: 20, price: 10 },
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

export const BUYBACK_SIZE = 10;
