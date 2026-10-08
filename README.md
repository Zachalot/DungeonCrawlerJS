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

## Project layout

```
index.html, css/style.css
js/
  main.js         boot + fixed-timestep game loop
  config.js       every tunable constant
  rng.js          seeded PRNG + coordinate hash
  input.js        keyboard/mouse state
  camera.js       follow + world clamp
  render.js       canvas drawing
  entities/       player
  world/          chunks, tiles, village, dungeon placement, bounds, collision
  ui/             HUD
tests/            node:test suites
```

## Milestones

| # | Milestone | Status |
|---|---|---|
| M1 | World + movement | ✅ Done |
| M2 | Combat | |
| M3 | Progression | |
| M4 | Items + vendors | |
| M5 | Dungeons | |
| M6 | Persistence + death | |
| M7 | Maps + polish | |

### Endless world later

Generation is a pure function of `(seed, x, y)`, built per 32×32 chunk. The fixed 400×400 size is enforced only in `js/world/bounds.js`, so making that check always pass gives an endless world. The camera clamp in `js/camera.js` would also need to go.
