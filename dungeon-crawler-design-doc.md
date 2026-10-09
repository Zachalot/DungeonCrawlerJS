# Dungeon Crawler RPG — Design Doc (POC)

> Status: Draft v0.2 · Platform: Browser (HTML / CSS / vanilla JS) · Persistence: `localStorage`

**Changes in v0.2:** decided on grave retrieval for death, no weapon damage bonus in the POC, sword cleave/speed/knockback, Level 1 Zombies deal 2 damage, a fixed world size built so it can become endless later, and all of the "not in the original spec" items added as requirements. Items marked **[Default]** are my choice where you haven't decided. Change any of them freely.

---

## 1. Overview

A real-time, top-down 2D action RPG. The player starts in a safe village, gears up from vendors, explores a tile-based overworld with scattered zombies, rocks, and trees, and clears dungeons placed roughly every 50 tiles. Each dungeon ends in a treasure chest. Killing enemies earns XP, and levels grant stat points. Dying drops all of your gear into a grave that you get one chance to recover.

### 1.1 POC goals
- Prove the core loop: **gear up → explore → fight → loot → return → upgrade**.
- Three weapon playstyles that feel different and are each viable.
- Save and resume through `localStorage`.
- Data-driven content (items, enemies, prices) so later expansion doesn't need a rewrite.
- Build world generation so the fixed POC world can become an endless world later (§7.2).

### 1.2 Non-goals (for now)
Databases or servers, multiplayer, more than one enemy type, resource harvesting, dodge, weapon damage bonuses, dungeon level scaling (the data hooks exist; see §7.4), an endless world, and audio. Art is simple shapes or a free tileset (§16).

---

## 2. Core Loop

```
Village (safe) ──buy potions/arrows/armor──▶ Overworld ──find──▶ Dungeon ──clear──▶ Chest
     ▲                                          │                                     │
     └──────────── return to sell loot / respawn on death ◀────────────────────────────┘
                         (then run back to your grave to recover gear)
```

---

## 3. Controls

| Input | Action |
|---|---|
| WASD / arrow keys | Move |
| Mouse | Aim |
| Left click / Space | Attack with the equipped weapon |
| 1 / 2 / 3 | Switch to Sword / Bow / Staff |
| Q / E | Drink health / mana potion |
| I | Inventory and equipment |
| C | Character sheet (spend stat points) |
| M | Toggle the large map |
| F | Interact (vendor, stash, dungeon entrance, chest, grave) |
| Esc | Pause / close menu |
| ` (backtick) | Dev panel (§14.4) |

The player carries all three weapons and swaps between them instantly; weapons aren't a "class" choice. Hybrid stat builds are therefore valid, and when you run out of arrows or mana, you swap to the sword.

---

## 4. Player

### 4.1 Stats

| Stat | Effect |
|---|---|
| **Strength (STR)** | Sword damage = `STR × 1` |
| **Intellect (INT)** | Fireball damage = `floor(INT × 1.5)`; Max Mana = `INT × 10` |
| **Dexterity (DEX)** | Arrow damage = `floor(DEX × 1.5)`; reserved for a future dodge mechanic |
| **Endurance (END)** | Max HP = `END × 10` |

**Starting stats:** 5 in each stat → 50 HP, 50 Mana, Sword 5, Fireball 7, Arrow 7.

**Rounding rule:** use `floor()` for every derived value that can produce a fraction, and apply it once, at the end of the calculation. The only exception is armor mitigation, which uses probabilistic rounding (§6).

### 4.2 Leveling
- +3 unspent stat points per level, assigned on the Character screen.
- XP to the next level: `xpToNext(level) = 50 × level` (L1→2 = 50 XP, L2→3 = 100, …).
- Level 1 Zombie XP: 10.
- **The player fully heals HP and mana on level-up.**
- **The Character screen previews derived stats** (HP, mana, and all three weapon damages, before → after) while points are pending. Points are committed only when the player clicks Confirm.
- **Respec Trainer** in the village: resets all spent points for `50 g × level`. **[Default]** After a respec, current HP and mana are clamped to the new maximums.
- Excess XP carries over, and one big XP grant can level up several times.
- Committing Endurance or Intellect points raises *current* HP or mana by the same amount as the maximum, so allocating mid-fight never leaves you "missing" HP.
- **Menus pause the game.** The character sheet and all NPC dialogs stop the simulation while open.

### 4.3 Regeneration

| Resource | In combat | Out of combat (no damage dealt or taken for 5 s) | In village |
|---|---|---|---|
| HP | none | 1% of max / s | 10% of max / s |
| Mana | 0.5% of max / s | 2% of max / s | 10% of max / s |

Potions are the burst refill. Regen is tracked as a fractional accumulator, while displayed and stored values are whole numbers.

---

## 5. Weapons and Combat

### 5.1 Weapon table

| Weapon | Damage | Cost | Range | Cooldown | Special |
|---|---|---|---|---|---|
| **Sword** | `STR × 1` | None | Melee, 90° arc in front, ~1.2 tiles | 0.4 s | **Cleave** (hits every enemy in the arc) + **knockback** 0.5 tiles |
| **Bow** | `floor(DEX × 1.5)` | 1 arrow | Projectile, ~8 tiles | 0.6 s | Can't fire with 0 arrows ("No arrows!" toast) |
| **Staff** | `floor(INT × 1.5)` | 5 mana | Projectile, ~7 tiles | 0.8 s | Can't cast with < 5 mana ("Not enough mana" toast) |

- Projectiles are stopped by rocks, trees, and walls, and hit the first enemy in their path.
- Weapon identities:
  - **Sword:** free, fast, strong against crowds.
  - **Bow:** long-range single target, costs gold over time.
  - **Staff:** highest burst damage, costs mana, slowest attack.
- **No weapon damage bonus in the POC.** All three weapons are fixed starter items. The item schema keeps a `weaponBonus` field (always 0) so weapon tiers can be added later without a save migration.

### 5.2 Hit feedback and safety
- Floating damage numbers (white for damage dealt, red for damage taken, grey "Blocked!" when armor negates a hit).
- A white flash on any entity when it takes a hit.
- **Player invulnerability frames:** 0.5 s after taking damage, during which the player sprite flickers. Without this, a pack of zombies would drain HP every frame.
- **Knockback** on sword hits pushes the target directly away from the player. It is blocked by obstacles (the target stops at the wall).

---

## 6. Armor and Damage Mitigation

### 6.1 Formula

```
reduction = armor / (armor + 50)
```

| Total armor | Reduction |
|---|---|
| 0 | 0% |
| 10 | 17% |
| 25 | 33% |
| 50 | 50% |
| 100 | 67% |

Each extra point of armor gives a little less than the last, and the reduction never reaches 100%, so no cap is needed.

### 6.2 Probabilistic rounding

```js
function mitigate(rawDamage, armor) {
  const reduced = rawDamage * (1 - armor / (armor + ARMOR_K)); // ARMOR_K = 50
  const whole = Math.floor(reduced);
  const frac = reduced - whole;
  return whole + (Math.random() < frac ? 1 : 0);
}
```

Worked example: a Level 1 Zombie hit (2 damage) against a full Leather set (12 armor, 19%) gives `1.61` raw. The player takes 2 damage 61% of the time and 1 damage 39% of the time. Low-damage hits become a chance to block, high-damage hits become a percentage reduction, and the average always equals the tooltip value.

A hit that rolls 0 damage shows "Blocked!" and **does not trigger i-frames**.

### 6.3 Armor values

| Slot | Leather (vendor) | Iron (vendor) | Steel (chest only) |
|---|---|---|---|
| Helmet | 2 | 4 | 7 |
| Chest | 5 | 10 | 16 |
| Legs | 3 | 7 | 11 |
| Gloves | 1 | 3 | 5 |
| Boots | 1 | 3 | 5 |
| **Full set** | **12 (19%)** | **27 (35%)** | **44 (47%)** |

Every item has a `stats: {}` field (empty in the POC) for future secondary bonuses like `{ end: 1 }`.

---

## 7. World

### 7.1 Tile model
- The world is a tile grid. **1 tile = 32 px.** Movement is smooth (pixel-based) with tile-based collision (axis-separated AABB vs solid tiles). All distances in this doc are in tiles.
- Tile types: `grass`, `path`, `rock` (solid, blocks projectiles), `tree` (solid, blocks projectiles), `village_floor`, `village_wall`, `dungeon_entrance`, and in dungeons `dungeon_floor`, `dungeon_wall`, `exit_portal`.
- Rocks and trees aren't harvestable yet. Their gameplay role is obstacles you can kite zombies around and chokepoints where you can funnel packs into sword cleaves.

### 7.2 World generation — fixed now, endless-ready
- **POC world:** fixed at **400 × 400 tiles**, with the village at the center. The world edge is an impassable border of trees.
- **Seeded:** a seeded PRNG (mulberry32) plus a coordinate hash. The same seed always produces the same world, so the save stores the seed plus changes, not the map.
- **Endless-ready design.** Even though the POC world is fixed, generation is written as a pure per-chunk function:
  ```js
  generateChunk(seed, chunkX, chunkY) // → 32×32 tiles + spawn points + dungeon entrance (if any)
  ```
  - Chunks are 32 × 32 tiles and generated lazily as the camera approaches them, then cached in memory.
  - Every random decision in a chunk comes from `hash(seed, chunkX, chunkY, purpose)`, never from a shared global RNG stream. That way, generation order doesn't matter.
  - The POC simply refuses to generate chunks outside the 400×400 bounds (they become border trees). **Going endless later means deleting that bounds check.** The target behavior is chunks generating as fog of war is cleared.
- **Village:** 12 × 12 tiles at the world center, walled, with a gate gap on each side, and a 5-tile clear buffer around it.
- **Overworld density (per tile, outside the village plus buffer):** rock 3%, tree 5%, zombie spawn point 0.4%.
- **Dungeon placement:** the world is divided into 50 × 50 tile **dungeon cells**. Each cell gets one entrance at a hashed random offset (at least 5 tiles from the cell edges), and the village's cell is skipped. The result is "about every 50 tiles" without visible grid lines, and the scheme extends to an infinite world unchanged. A 400×400 world yields about 63 dungeons.

### 7.3 Village (safe zone)
- Zombies treat village tiles as solid, never path in, and lose aggro when the player crosses the border.
- Contents:
  - **Potion Vendor**
  - **General Vendor**
  - **Stash**
  - **Respec Trainer**
  - **Respawn point** (center)
- The game autosaves when the player enters the village (§13.2).
- HP and mana regenerate quickly here (§4.3).

### 7.4 Dungeons
- **Entry:** stand on the entrance and press F. This loads a separate dungeon map; the overworld state is kept in memory.
- **Layout:** generated from `hash(seed, dungeonId)` using random room placement plus L-shaped corridors: 5–8 rooms, roughly 60 × 60 tiles. The same dungeon always generates the same layout.
- **Start room:** the exit portal back to the overworld, with no enemies.
- **End room:** the room farthest from the start (by BFS distance), which holds the **treasure chest**.
- **Enemies:** 3–6 Level 1 Zombies per room, with a denser pack (6–8) in the room just before the chest room.
- **Cleared state:** opening the chest marks the dungeon `cleared`. Cleared dungeons respawn zombies on re-entry but never the chest. Their overworld entrance and minimap icon are drawn greyed out ("Looted").
- **Dungeon level hook:** every dungeon stores `dungeonLevel = 1 + floor(distanceFromVillage / 50)`. The POC spawns Level 1 Zombies regardless, but the level is displayed at the entrance ("Dungeon — Lv 3") so the convention exists before scaling is implemented.

### 7.5 Chest loot table (POC)
The chest always contains `20–40 g` and **one** roll from:

| Weight | Item |
|---|---|
| 60% | Random Steel armor piece (chest-only tier) |
| 25% | 3× Greater Health Potion + 3× Greater Mana Potion |
| 15% | 100 arrows |

Chest contents are rolled once when the chest is first opened, and the result is saved. If the inventory is full, the leftover items stay in the chest UI until the player makes room.

---

## 8. Enemies

### 8.1 Level 1 Zombie

| Property | Value |
|---|---|
| HP | 10 |
| Damage | **2** (melee; attack range 1.0 tile center to center, stops advancing at 0.75) |
| Attack cooldown | 1.0 s (plus a 0.25 s wind-up so the player can react) |
| Move speed | 60% of player speed |
| Aggro radius | 6 tiles (requires line of sight) |
| De-aggro | >12 tiles away, or the player enters the village |
| XP | 10 |
| Drops | 60% chance: 1–3 g; 10% chance: 2–5 arrows. Auto-collected on kill, with no ground items. |

**Starting balance:** at 2 damage, a fresh player (50 HP, no armor) survives 25 hits. Starting weapons kill a zombie in 2 hits (sword at 5 damage, fireball and arrow at 7 damage).

**AI states:**
- `idle`: wander within 3 tiles of spawn.
- `chase`: move straight at the player, sliding along obstacles. No A* in the POC.
- `windup` → `attack`: when in range and off cooldown. The hit lands only if the player is still within 1.25× attack range when the windup ends, so stepping back dodges it. A sword knockback interrupts the windup.
- `return`: walk back to spawn after de-aggro, healing to full HP. Any hit re-provokes a chase.

**Overworld respawn:** a dead zombie's spawn point reactivates after 120 s, but only while the point is off-screen.

### 8.2 Data-driven enemies
Enemies are defined in `data/enemies.js`:
```js
{ id: "zombie_l1", name: "Zombie", level: 1, hp: 10, damage: 2, speed: 0.6,
  aggroRadius: 6, deaggroRadius: 12, attackRange: 1.0, stopDistance: 0.75,
  attackCooldown: 1.0, windup: 0.25, xp: 10, dropTable: "zombie_common" }
```

**Simulation scope:** only zombies whose spawn point is within 1 chunk of the player's chunk are alive. Calm (idle or returning) zombies more than 2 chunks away despawn, and their spawn point refills when the player comes back. This keeps about 30–60 zombies simulated instead of all ~640.
New enemy types are added as data entries, optionally with a new `ai` behavior. Future zombie levels (`zombie_l2`, …) get picked by `dungeonLevel`.

---

## 9. Items, Inventory, and Equipment

### 9.1 Equipment slots
`helmet`, `chest`, `legs`, `gloves`, `boots`, plus `sword`, `bow`, `staff`. The weapon slots are permanently filled with the starter weapons in the POC.

### 9.2 Item schema
```js
{
  id: "iron_helmet",          // definition id
  name: "Iron Helmet",
  type: "armor",              // armor | weapon | consumable | misc
  slot: "helmet",             // armor/weapon only
  armor: 4,                   // armor only
  weaponBonus: 0,             // weapon only; reserved, always 0 in POC
  stats: {},                  // reserved for future bonuses, e.g. { end: 1 }
  stackable: false,
  maxStack: 1,
  buyPrice: 40,
  sellPrice: 20               // always floor(buyPrice × 0.5)
}
```
Item **instances** are `{ uid, defId, qty }`. Definitions live in code, and only instances are saved.

### 9.3 Inventory
- **24 slots.** The limit forces trips back to the village to sell, which drives the core loop.
- Potions stack up to 20.
- **Arrows use a dedicated quiver counter** (max 999), not inventory slots. **[Default]**
- Gold is a separate counter, not an item.
- Tooltips compare an item against the currently equipped item in that slot (green/red armor delta).

---

## 10. Economy and Vendors

### 10.1 Potion Vendor

| Item | Effect | Price |
|---|---|---|
| Minor Health Potion | +25 HP | 10 g |
| Minor Mana Potion | +25 Mana | 10 g |
| Greater Health Potion | +40% of max HP | 40 g |
| Greater Mana Potion | +40% of max Mana | 40 g |

- Greater potions restore a percentage, so they stay relevant as the player levels. Minor potions are the cheap early option.
- Potions share a **1 s cooldown** to prevent spamming.
- Q and E drink the best potion available of each type (Greater first) **[Default]**.

### 10.2 General Vendor
- **Sells:**
  - Arrows: 20 for 10 g
  - Leather armor: 5–25 g by slot
  - Iron armor: 20–80 g by slot
- **Buys:** any item at 50% of its buy price, including chest-only Steel armor (50–150 g).
- **Buyback tab:** the last 10 items sold, repurchasable at the price they sold for. The list is cleared on save load.

### 10.3 Stash (village)
- 24 slots plus a gold deposit. **Items in the stash are never lost on death.**
- The stash is what makes the death penalty a strategic choice: you decide what to risk bringing out.

### 10.4 Starting kit
Starter Sword, Starter Bow, Starter Staff, 30 arrows, 2 Minor Health Potions, 2 Minor Mana Potions, and 25 g.

---

## 11. Death and Graves (Souls-style)

1. **On death,** all equipped armor, all inventory items, and all quiver arrows drop into a **grave** at the death location. Gold is kept. The starter weapons stay with the player so they're never helpless.
2. **The player respawns** in the village with full HP and mana.
3. **Recovery:** walk to the grave and press F to restore everything. Armor re-equips into its original slots; if the inventory is full, the overflow stays in the grave.
4. **One grave at a time.** Dying again before recovery permanently destroys the previous grave and its contents, and a new grave is created at the new death location. This is the real "lose everything" moment.
5. **Dying in a dungeon** places the grave just outside that dungeon's overworld entrance, so recovery doesn't require re-clearing the dungeon.
6. **Visibility:** the grave is always shown on the minimap and the large map, even in unexplored fog, and an edge-of-screen arrow points to it when it's off-screen.
7. **Zombies near the grave behave normally,** so the run back carries real risk. Zombie spawns are not boosted near graves in the POC.
8. **The game saves immediately on death,** before the respawn, so refreshing the page can't undo a death.

---

## 12. UI / HUD

**Layout:** a `<canvas>` for the world, plus **HTML/CSS overlays** for all UI (HUD, panels, tooltips, toasts).

- **HUD (always visible):**
  - HP bar, mana bar, and XP bar with level
  - Gold and arrow count
  - Weapon icons 1/2/3 (the equipped one highlighted, with a cooldown sweep)
  - Potion counts (Q/E)
  - Grave direction arrow (when a grave exists)
- **Minimap** (top right, ~160 px):
  - Shows explored tiles only, under fog of war.
  - Icons: village, discovered dungeon entrances (looted ones greyed out), grave, and player.
  - **M** opens a full-screen map with the same layers.
- **Fog of war:**
  - Tiles within an 8-tile radius of the player become explored.
  - Explored state is tracked per chunk as a bitset and saved (§13.1).
  - The world view is never fogged in the POC; fog applies only to the maps.
  - This same exploration hook is where endless generation will trigger later.
- **Panels:**
  - Inventory + Equipment (paper-doll and 24-slot grid)
  - Character Sheet (stats, + buttons, live derived-stat preview, Confirm/Cancel)
  - Vendor (Buy / Sell / Buyback tabs)
  - Stash
  - Chest loot
  - Respec Trainer
  - Save slot menu
- **Toasts:** "No arrows!", "Not enough mana", "Level up!", "Inventory full", "Grave recovered", "Your previous grave was lost".
- **Tooltips:** item name, type, armor value, sell price, and a comparison against the equipped item.

---

## 13. Persistence (localStorage)

### 13.1 Save schema
```json
{
  "version": 1,
  "seed": 1234567,
  "savedAt": "2026-10-08T12:00:00Z",
  "player": {
    "x": 6400, "y": 6400,
    "location": { "type": "overworld" },
    "level": 3, "xp": 40, "unspentPoints": 0,
    "stats": { "str": 8, "int": 5, "dex": 7, "end": 7 },
    "hp": 62, "mana": 50, "gold": 112, "arrows": 44,
    "equipment": { "helmet": { "uid": "a1", "defId": "leather_helmet" }, "...": "..." },
    "inventory": [ { "uid": "b2", "defId": "minor_hp_potion", "qty": 3 }, null ]
  },
  "stash": { "gold": 0, "items": [] },
  "grave": { "x": 7100, "y": 6950, "equipment": {}, "items": [], "arrows": 12 },
  "dungeons": { "3_5": { "cleared": true } },
  "chests": { "3_5": { "opened": true, "remaining": [] } },
  "explored": { "12_9": "<base64 1024-bit bitset>" }
}
```
- `explored` and `dungeons` are keyed by chunk and dungeon-cell coordinates. They are sparse maps rather than fixed arrays, so they work for an endless world without a migration.
- Live enemy positions are **not** saved. They are regenerated from the seed on load.

### 13.2 Rules
- **Three save slots:** `dungeonCrawler.slot1` / `slot2` / `slot3`. The title screen shows level, play time, and last-saved time for each slot.
- **Autosave triggers:**
  - Entering the village
  - Entering or leaving a dungeon
  - Opening a chest
  - Recovering a grave
  - Every 60 s
  - On `beforeunload`
  - **Immediately on death**
- **Versioning:** every save has a `version`. `migrate(save)` upgrades saves step by step (v1→v2→…) so saves keep loading as the design changes.
- **Export/Import:**
  - Export copies the save JSON (base64-encoded) to the clipboard.
  - Import is a paste box that validates and migrates the save before loading it.
  - This doubles as a debugging and sharing tool, and as a backup in case browser data is cleared.
- **Size check:** warn in the console if a save exceeds 1 MB. That's well under the ~5 MB `localStorage` limit, but it's an early signal for when the world becomes endless.

---

## 14. Technical Architecture

### 14.1 Stack
- Vanilla JS (ES modules), HTML5 Canvas 2D, and CSS. No framework and no build step.
- **Run it from a local server, not `file://`.** Browsers block ES modules on `file://`, so serve the folder with `npx serve .` or `python -m http.server`. The README documents this.

### 14.2 File layout
```
index.html
README.md
css/style.css
js/
  main.js            // boot, title screen, game loop
  config.js          // all tunable constants (multipliers, ARMOR_K, regen, i-frames, radii)
  rng.js             // mulberry32 + coordinate hash
  input.js           // keyboard + mouse state
  camera.js
  save.js            // slots, autosave, migrate, export/import
  world/
    chunks.js        // generateChunk(), chunk cache, bounds check (remove for endless)
    overworld.js     // tile queries, rendering visible chunks
    village.js
    dungeon.js       // room+corridor gen, chest placement
    collision.js     // tile collision, grid raycast for LOS / projectiles
    fog.js           // explored bitsets
  entities/
    player.js
    zombie.js
    projectile.js
    grave.js
  systems/
    combat.js        // damage calc, mitigate(), cleave arc, knockback, i-frames
    leveling.js
    loot.js          // drop tables, chest rolls
    regen.js
    death.js         // grave creation/recovery
  data/
    items.js
    enemies.js
    vendors.js
    lootTables.js
  ui/
    hud.js
    minimap.js
    inventory.js
    character.js
    vendor.js
    stash.js
    trainer.js
    tooltip.js
    toast.js
    devpanel.js
```

### 14.3 Engineering principles
- **All balance numbers live in `config.js` and `data/`.** Logic files contain no magic numbers.
- **Fixed-timestep update (60 Hz) with interpolated rendering** keeps cooldowns and movement consistent across monitor refresh rates.
- **Render only visible chunks and tiles.** Offscreen-canvas caching per chunk is optional if performance needs it.
- **Generation is pure:** `generateChunk` and `generateDungeon` depend only on `(seed, coords)`. This is what makes the endless world possible later.

### 14.4 Dev panel (backtick key)
- Add gold, add XP, or level up
- Teleport to the village, the nearest dungeon, or the grave
- Toggle god mode
- Show collision boxes and aggro radii
- Reveal the full map
- Kill all nearby enemies
- Print the current save JSON

---

## 15. Milestones

| # | Milestone | Done when |
|---|---|---|
| M1 | World + movement | Seeded chunked overworld, village, rocks and trees render; the player walks with collision; the camera follows |
| M2 | Combat | Sword (cleave + knockback), bow (arrows), and staff (mana) work; Level 1 Zombies chase, wind up, attack, and die; i-frames and damage numbers work. *Regen was pulled forward from M3 so the staff stays usable, and death temporarily respawns you in the village with no penalty until M6.* |
| M3 | Progression | XP, level-up full heal, stat allocation with preview, Respec Trainer. *Zombie gold/arrow drops were pulled forward from M4 so the respec can be paid for.* |
| M4 | Items + vendors | Inventory, equipment, armor mitigation, both vendors with buyback, potions with cooldown, stash |
| M5 | Dungeons | Entrances spawn per cell, dungeons generate, chest loot works, cleared state, level label on entrances |
| M6 | Persistence + death | Save slots, autosave triggers, migration, export/import, graves with one-grave rule |
| M7 | Maps + polish | Minimap, large map, fog of war, grave arrow, tooltips with comparison, toasts, dev panel |

---

## 16. Remaining Open Questions

1. **Art:** colored shapes for the POC **[Default]**, or a free CC0 tileset (e.g. Kenney.nl)?
2. **Arrows:** a dedicated quiver counter **[Default]**, or regular inventory stacks?
3. **Respec cost:** is `50 g × level` OK?
4. **Should arrows drop into the grave** on death **[Default: yes]**, or stay with the player like gold?

---

## 17. Future Features (backlog)
- **Endless world:** remove the bounds check in `chunks.js`, generate chunks as fog clears, and evict far-away chunks from memory.
- **Distance-based dungeon levels and enemy scaling:** `dungeonLevel` already exists, so add `zombie_l2+` entries and pick by level.
- **Weapon tiers:** use the `weaponBonus` field: `damage = floor(stat × mult) + weaponBonus`.
- **Armor secondary stats:** use the `stats` field.
- **More enemy types:** a ranged skeleton (gives obstacles a role as cover) and a fast, fragile ghoul.
- **Dodge:** a DEX-scaled roll with i-frames.
- **Harvesting and crafting:** gather from rocks and trees to craft arrows and potions.
- **Loot depth:** item rarity and random affixes.
- **More INT spells:** fireball splash damage, frost bolt (slow), heal.
- **Content:** boss rooms in higher-level dungeons, village quests, a day/night cycle, sound and music.
