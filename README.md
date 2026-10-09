# Dungeon Crawler JS

A top-down 2D dungeon crawler RPG proof of concept in vanilla JavaScript, HTML, and CSS. No framework, no build step, and saves will live in `localStorage`.

See [dungeon-crawler-design-doc.md](dungeon-crawler-design-doc.md) for the full design.

## Running

Browsers block ES modules on `file://`, so serve the folder over HTTP:

```bash
npm start
```

Then open <http://localhost:8080>. `python -m http.server 8080` works too.

The world seed is in the URL (`?seed=42`). Refreshing keeps the same world, and **New world** picks a random seed.

## Controls

| Input | Action |
|---|---|
| WASD / arrow keys | Move |
| Mouse | Aim |
| Left click / Space (hold) | Attack |
| 1 / 2 / 3 | Sword / Bow / Staff |
| C | Character sheet (spend stat points) |
| F | Talk to a nearby NPC |
| Esc | Close the open panel |

Zombies give 10 XP plus a chance of gold and arrows. Each level needs `50 × level` XP and grants 3 stat points. The Respec Trainer in the village's northwest corner resets your stats for `50 g × level`. Menus pause the game.

| Weapon | Damage | Cost | Notes |
|---|---|---|---|
| Sword | STR × 1 | free | 90° cleave, knockback, 0.4 s |
| Bow | floor(DEX × 1.5) | 1 arrow | 8-tile range, 0.6 s |
| Staff | floor(INT × 1.5) | 5 mana | 7-tile range, 0.8 s |

Level 1 Zombies have 10 HP and deal 2 damage. Watch for the red windup: stepping back before it ends dodges the hit. They can't enter the village, and they give up the chase if you go inside.

For debugging, the running game is exposed as `window.game` in the browser console. For example, `game.player.arrows = 99`.

## Tests

```bash
npm test
```

The tests use Node's built-in test runner (Node 20+) and cover:
- Deterministic generation that doesn't depend on chunk order
- Village layout and the obstacle-free buffer
- Dungeon placement rules
- The world border
- Reachability of every dungeon from the spawn point
- Collision
- Armor mitigation math, weapon damage and costs, sword arc and knockback, projectiles
- Zombie AI states, windup timing, de-aggro, spawning and respawn timers
- Regen rates, i-frames, and respawn
- XP and leveling, stat allocation, respec, drops, NPC interaction range

## Project layout

```
index.html, css/style.css
js/
  main.js         boot, fixed-timestep loop, input → controls
  game.js         DOM-free simulation: combat, zombies, projectiles, respawn
  config.js       every tunable constant
  data/           weapon, enemy, and drop-table definitions
  rng.js          seeded PRNG + coordinate hash
  input.js        keyboard/mouse state
  camera.js       follow + world clamp
  render.js       canvas drawing
  entities/       player, zombie, projectile
  systems/        combat math, stats, leveling, loot, regen, spawner, effects
  world/          chunks, tiles, village, dungeon placement, bounds, collision, line of sight
  ui/             HUD, toasts, character sheet, trainer dialog
tests/            node:test suites
```

## Milestones

| # | Milestone | Status |
|---|---|---|
| M1 | World + movement | ✅ Done |
| M2 | Combat | ✅ Done (includes regen; death respawns you in the village with no penalty until M6) |
| M3 | Progression | ✅ Done (includes zombie gold/arrow drops) |
| M4 | Items + vendors | |
| M5 | Dungeons | |
| M6 | Persistence + death | |
| M7 | Maps + polish | |

### Endless world later

Generation is a pure function of `(seed, x, y)`, built per 32×32 chunk. The fixed 400×400 size is enforced only in `js/world/bounds.js`, so making that check always pass gives an endless world. The camera clamp in `js/camera.js` would also need to go.
