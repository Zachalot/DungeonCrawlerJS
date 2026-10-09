# Dungeon Crawler JS

A top-down 2D dungeon crawler RPG proof of concept in vanilla JavaScript, HTML, and CSS. No framework and no build step; saves live in your browser's `localStorage`.

## ▶ Play it

**https://zachalot.github.io/DungeonCrawlerJS/**

That's the latest `main`, deployed by GitHub Pages about a minute after each merge. If you just merged and don't see the change, wait a minute and hard-refresh (Ctrl+Shift+R / Cmd+Shift+R).

See [dungeon-crawler-design-doc.md](dungeon-crawler-design-doc.md) for the full design.

## How to play

You start in the walled village, where zombies can't reach you. Gear up, head into the wilderness, and find dungeons; there's about one every 50 tiles. Clear a dungeon to reach the treasure chest in its farthest room. If you die, your armor, bag, and arrows drop into a grave where you fell. Walk back and press F to recover them. Die again before you do, and the first grave is gone for good.

| Input | Action |
|---|---|
| WASD / arrow keys | Move |
| Mouse | Aim |
| Left click / Space (hold) | Attack |
| 1 / 2 / 3 | Sword / Bow / Staff |
| Q / E | Drink a health / mana potion |
| I | Inventory and equipment |
| C | Character sheet (spend stat points) |
| F | Interact: talk, open, enter, leave, recover |
| Esc | Pause menu, or close the open panel |

| Weapon | Damage | Cost | Notes |
|---|---|---|---|
| Sword | STR × 1 | free | 90° cleave with 1.7-tile reach, knockback, 0.4 s |
| Bow | floor(DEX × 1.5) | 1 arrow | 8-tile range, 0.6 s |
| Staff | floor(INT × 1.5) | 5 mana | 7-tile range, 0.8 s |

- **Zombies** have 10 HP and deal 2 damage. Watch for the red windup: stepping back before it ends dodges the hit. They can't enter the village.
- **Leveling:** zombies give 10 XP plus a chance of gold and arrows. Each level needs `50 × level` XP and grants 3 stat points.
- **Armor** reduces damage by `armor / (armor + 50)`. Leather and Iron sets are sold in the village; Steel only comes from dungeon chests.
- **The village** has a Potion Vendor (NE), a General Vendor who also buys your loot (SW), a Respec Trainer (NW), and a Stash (SE). Anything in the stash is safe from death.
- **Menus pause the game.**

## Saving

- The title screen has **three save slots**. Each one shows its level, play time, when it was last saved, and its world seed.
- The game **autosaves** every minute, when you enter the village or a dungeon, open a chest, recover a grave, die, and when you close the tab.
- **Saves stay in the browser you played in.** To move a save to another browser or computer, press Esc → **Export save** → Copy, then paste the code into **Import a save code** on the other browser's title screen.
- A `?seed=1234` in the URL only pre-fills the seed for a new game. It doesn't carry your progress; save slots do.

## Feedback: bugs and ideas

Found a bug or have an idea? **[Open an issue](https://github.com/Zachalot/DungeonCrawlerJS/issues/new/choose)** (you'll need a free GitHub account):

1. Go to the repo's **Issues** tab and click **New issue**, or use the link above.
2. Pick **Bug report** or **Enhancement or idea**. The form asks for what's needed.
3. For bugs, include your **world seed** (top-left panel, or the pause menu) and, ideally, your **save code** (Esc → Export save → Copy). That lets the bug be reproduced in your exact game.

Before opening a new issue, check the [open issues](https://github.com/Zachalot/DungeonCrawlerJS/issues) and add a 👍 or a comment if someone already reported it.

## Running locally

Browsers block ES modules on `file://`, so the folder has to be served over HTTP:

```bash
npm start
```

Then open the address it prints, normally <http://localhost:8080>. If port 8080 is already in use, `serve` picks a different port and prints that one instead, so always use the address shown in the terminal. Any static server works too, for example `python -m http.server 8080`.

Saves made on `localhost` are separate from saves made on the live site; browsers keep storage per address.

For debugging, the running game is exposed as `window.game` in the browser console, for example `game.player.gold = 500`.

## Tests

```bash
npm test
```

Tests use Node's built-in test runner (Node 20+) and run automatically on every pull request through GitHub Actions. They cover:
- **World:** deterministic generation that doesn't depend on chunk order, village layout, dungeon placement and reachability, the world border, collision
- **Combat:** armor math, weapon damage and costs, sword reach, knockback and click buffering, projectiles
- **Zombies:** AI states, windup timing, de-aggro, spawning and respawn timers
- **Progression:** XP and leveling, stat allocation, respec, drops, regen
- **Items:** inventory stacking, equipment, potions, vendors, buyback, stash
- **Dungeons:** layout, room populations, chest loot weights, enter/exit, loot persistence and overflow
- **Death and saving:** graves and the one-grave rule, save round-trips, migrations, validation, export/import, save slots

## Project layout

```
index.html, css/style.css
js/
  main.js         boot, title screen, fixed-timestep loop, input → controls, autosave
  game.js         DOM-free simulation: areas (overworld/dungeon), combat, interaction, death
  save.js         serialize/restore, migrations, validation, export/import, save slots
  config.js       every tunable constant
  data/           weapons, enemies, items, vendors, drop and chest loot tables
  entities/       player, zombie, projectile
  systems/        combat math, stats, leveling, inventory, economy, consumables, loot, death, regen, spawner, effects
  world/          overworld chunks, tiles, village, dungeon placement and interiors, bounds, collision
  ui/             HUD, panels (character, inventory, vendors, stash, chest, trainer, pause), title, tooltips, toasts
  render.js       canvas drawing
tests/            node:test suites
.github/          CI workflow and issue templates
```

## Milestones

| # | Milestone | Status |
|---|---|---|
| M1 | World + movement | ✅ Done |
| M2 | Combat | ✅ Done |
| M3 | Progression | ✅ Done |
| M4 | Items + vendors | ✅ Done |
| M5 | Dungeons | ✅ Done |
| M6 | Persistence + death | ✅ Done |
| M7 | Maps + polish (minimap, fog of war, dev panel) | |

### Endless world later

Generation is a pure function of `(seed, x, y)`, built per 32×32 chunk. The fixed 400×400 size is enforced only in `js/world/bounds.js`, so making that check always pass gives an endless world. Saves already key dungeon state by coordinates, so they need no change.
