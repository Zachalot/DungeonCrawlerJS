import { GATHER_BONUS_CAP, GATHER_BONUS_PER_LEVEL, NODES_PER_GATHER_LEVEL, STONE_PER_ROCK, WOOD_PER_TREE } from "../config.js";
import { ITEMS } from "../data/items.js";
import { Tile } from "../world/tiles.js";

const NODES = {
  [Tile.TREE]: { material: "wood", tool: "axe", yield: WOOD_PER_TREE, name: "tree" },
  [Tile.ROCK]: { material: "stone", tool: "pickaxe", yield: STONE_PER_ROCK, name: "rock" },
};

/** What harvesting a tile takes and gives, or null if it isn't a tree or rock. */
export function harvestNode(tile) {
  return NODES[tile] ?? null;
}

/** Gathering skill level from the number of harvests so far. */
export function gatheringLevel(harvests) {
  return 1 + Math.floor(harvests / NODES_PER_GATHER_LEVEL);
}

/** Chance that a harvest yields a second roll, from the Gathering skill. */
export function bonusChance(harvests) {
  return Math.min(GATHER_BONUS_CAP, GATHER_BONUS_PER_LEVEL * (gatheringLevel(harvests) - 1));
}

/** True if the bag holds a tool of `kind` ("axe" or "pickaxe"). */
export function hasTool(inventory, kind) {
  return inventory.some((slot) => slot && ITEMS[slot.defId].tool === kind);
}

/**
 * Harvests one node into the player's pouch and counts it toward the skill.
 * Returns { material, amount, bonus } (bonus = the skill gave a second roll).
 */
export function harvest(player, tile, random) {
  const node = NODES[tile];
  const roll = () => node.yield[0] + Math.floor(random() * (node.yield[1] - node.yield[0] + 1));
  const bonus = random() < bonusChance(player.harvests);
  const amount = roll() + (bonus ? roll() : 0);
  player.materials[node.material] += amount;
  player.harvests += 1;
  return { material: node.material, amount, bonus };
}
