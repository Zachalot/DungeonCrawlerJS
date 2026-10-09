# Dungeon Crawler JS

A top-down 2D dungeon crawler RPG proof of concept in vanilla JavaScript, HTML, and CSS. No framework and no build step. Sign in to keep your saves in the cloud (Supabase), or play without an account and keep them in your browser's `localStorage`.

## ▶ Play it

**https://zachalot.github.io/DungeonCrawlerJS/**

That's the latest `main`, deployed by GitHub Pages about a minute after each merge. If you just merged and don't see the change, wait a minute and hard-refresh (Ctrl+Shift+R / Cmd+Shift+R).

See [designDocs/dungeon-crawler-design-doc.md](designDocs/dungeon-crawler-design-doc.md) for the full design, [designDocs/migration-to-persistent-storage.md](designDocs/migration-to-persistent-storage.md) for accounts and cloud saves, and [designDocs/multiplayerDesign.md](designDocs/multiplayerDesign.md) for future multiplayer plans.

## How to play

You start in the walled village, where zombies can't reach you. Gear up, head into the wilderness, and find dungeons; there's about one every 50 tiles. Clear a dungeon to reach the treasure chest in its farthest room, then climb the ladder beside it straight back to the surface. If you die, your armor, bag, and arrows drop into a grave where you fell. Walk back and press F to recover them. Die again before you do, and the first grave is gone for good.

| Input | Action |
|---|---|
| WASD / arrow keys | Move |
| Mouse | Aim |
| Left click / Space (hold) | Attack |
| 1 / 2 / 3 | Sword / Bow / Staff |
| Hold Q | Potion wheel: point at a potion and release Q to drink it, or release in the middle to cancel |
| I | Inventory: drag gear onto the stick figure to equip it |
| C | Character sheet (spend stat points) |
| M | Full-screen map of everywhere you've explored: scroll to zoom, drag to pan |
| F | Interact: talk, open, enter, leave, recover |
| Esc | Pause menu, or close the open panel |
| ` (backtick) | Dev panel (local play, or add `?dev` to the URL) |

| Weapon | Damage | Cost | Notes |
|---|---|---|---|
| Sword | STR × 1 | free | 90° cleave with 1.7-tile reach, knockback, 0.4 s |
| Bow | floor(DEX × 1.5) | 1 arrow | 8-tile range, 0.6 s |
| Staff | INT × 3 | 5 mana | 7-tile range, 0.8 s. Hits hard, but mana only regenerates in the village, so bring mana potions |

- **Zombies** have 10 HP and deal 2 damage. Watch for the red windup: stepping back before it ends dodges the hit. They can't enter the village.
- **Leveling:** zombies give 10 XP plus a chance of gold and arrows. Each level needs `50 × level` XP and grants 3 stat points.
- **Weapons are items.** You start with a Starter Sword, Bow, and Staff equipped. A weapon you take off can't be used until you equip one again.
- **Armor** reduces damage by `armor / (armor + 50)`. Leather and Iron sets are sold in the village; Steel only comes from dungeon chests.
- **The village** has a Potion Vendor (NE), a General Vendor who also buys your loot (SW), a Respec Trainer (NW), and a Stash (SE). Anything in the stash is safe from death. Click or drag stacks between your bag and the stash, or use the separate "all items" and "all gold" buttons.
- **Hover any item** to see its stats and what clicking it does.
- **Maps:** the minimap (top right) and the full map (M) show only what you've explored. The village is a gold square, unlooted dungeons are orange stairs icons, looted ones are grey with a ✓, and your grave is always marked. On the full map, scroll to zoom, drag to pan, and zoom in to see labels like "Lv 2" and "Looted".
- **Menus pause the game,** except the potion wheel and the dev panel.

## Accounts and saving

- **Create an account** (username, email, and password) on the title screen to keep your saves in the cloud. Sign in from any browser and your slots are there. **Forgot password?** emails you a reset link; open it in the browser you play in.
- **Or play without an account.** Saves then stay in the browser you played in, as before. If you sign in later, the title screen offers to copy those saves into your account.
- Each account has **three save slots**. Each one shows its level, play time, when it was last saved, and its world seed.
- The game **autosaves** every minute, when you enter the village or a dungeon, open a chest, recover a grave, die, and when you close the tab. Signed in, each save lands on your device at once and in the cloud a few seconds later. If the connection drops, you keep playing and it syncs when it's back.
- **Played the same slot on two devices without syncing in between?** The title screen shows both copies and lets you choose which to keep, and you can copy either one as a save code first.
- **Save codes** still work: Esc → **Export save** → Copy, then paste into **Import a save code** on any title screen. They're handy as a backup or for bug reports.
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

Saves made without an account on `localhost` are separate from those on the live site, since browsers keep storage per address. Accounts work on both, because they use the same Supabase project.

## Backend (Supabase)

Accounts and cloud saves use a [Supabase](https://supabase.com) project. There is no server code of our own: Supabase hosts the Postgres database and the sign-in service, and the browser talks to them directly. The project URL and publishable key in [js/cloud/config.js](js/cloud/config.js) are public by design; row-level security in the database is what keeps each player's data private. **Never** put the secret (`service_role`) key in this repo.

### Where it lives

| What | Link |
|---|---|
| Project dashboard | <https://supabase.com/dashboard/project/izutqcgxepfpqeffuetn> |
| SQL Editor (run migrations and queries) | <https://supabase.com/dashboard/project/izutqcgxepfpqeffuetn/sql> |
| Table Editor (browse saves and profiles) | <https://supabase.com/dashboard/project/izutqcgxepfpqeffuetn/editor> |
| Authentication: users, providers, email, URL settings | <https://supabase.com/dashboard/project/izutqcgxepfpqeffuetn/auth/users> |
| API keys | <https://supabase.com/dashboard/project/izutqcgxepfpqeffuetn/settings/api-keys> |
| API endpoint used by the game | `https://izutqcgxepfpqeffuetn.supabase.co` |

The project ref is `izutqcgxepfpqeffuetn`. It's on the free plan, which pauses a project after about a week with no activity: if sign-in or syncing stops working, check the dashboard and click **Restore** if it's paused. The game keeps working without an account meanwhile, and signed-in players' progress waits on their device until the project is back.

### Schema

Everything lives in the `public` schema, and is defined by the files in [supabase/migrations/](supabase/migrations/). Those files are the source of truth: change the database by adding a migration file, not by editing tables in the dashboard.

**Tables**

| Table | One row per | Columns | Who can do what (row-level security) |
|---|---|---|---|
| `profiles` | account | `id` (= `auth.users.id`), `username` (3–20 letters, digits, `_`; unique ignoring case), `created_at` | Any signed-in player can read usernames. A player can change only their own `username`. Rows are created by a trigger, never by the browser. |
| `saves` | account × slot | `user_id`, `slot` (1–3), `version` (the save format version), `revision` (bumped on every write), `data` (the whole save as `jsonb`, max 1 MB), `updated_at` | A player can read, write, and delete only their own rows. |

Emails and password hashes are **not** in these tables. They live in Supabase's own `auth.users` table, which the browser can't query.

**Functions (stored procedures)**

| Function | Called by | What it does |
|---|---|---|
| `save_slot(p_slot, p_version, p_data, p_base_revision)` | the game, on every cloud save | Writes a slot only if its stored `revision` still equals `p_base_revision` (0 = first save), and returns the new revision. Otherwise raises `revision_conflict`, which the game shows as a "saved on two devices" choice instead of overwriting. Runs with the caller's permissions, so row-level security still applies. Signed-in players only. |
| `username_available(p_username)` | the sign-up form | Returns whether a username is free (ignoring case). Callable before signing in. |
| `handle_new_user()` | trigger `on_auth_user_created` on `auth.users` | When an account is created, inserts its `profiles` row using the username from the sign-up form. If the username is taken, the sign-up fails. |

To confirm the database matches the migrations, run [supabase/verify.sql](supabase/verify.sql) in the SQL Editor. It's read-only, and its comments say what each result should be.

### Setting up a project

Already done for the live site; these are the steps for a fresh project:

1. **Database:** in the dashboard's **SQL Editor**, paste and run [supabase/migrations/0001_profiles.sql](supabase/migrations/0001_profiles.sql), then [0002_saves.sql](supabase/migrations/0002_saves.sql). Both are safe to re-run. Then run [supabase/verify.sql](supabase/verify.sql) and compare the results with its comments.
2. **Authentication → Sign In / Providers:** Email on, minimum password length 8.
3. **Authentication → URL Configuration:** Site URL `https://zachalot.github.io/DungeonCrawlerJS/`; add `https://zachalot.github.io/DungeonCrawlerJS/**` and `http://localhost:8080/**` to the redirect URLs. Emailed links can only return to these.
4. **Authentication → SMTP Settings:** configure an email sender so confirmation and reset emails reach players (Supabase's built-in sender only reaches your own team). Then turn on **Confirm email**. See §3.6 of the [storage design doc](designDocs/migration-to-persistent-storage.md).

If the Supabase library can't load, the game falls back to playing without an account.

**Dev panel:** press ` (backtick) while playing locally for cheats such as gold, XP, teleports, god mode, hitboxes, map reveal, kill nearby, and save JSON. On the live site, add `?dev` to the URL first: <https://zachalot.github.io/DungeonCrawlerJS/?dev>. The running game is also exposed as `window.game` in the browser console, for example `game.player.gold = 500`.

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
- **Accounts:** sign-up outcomes, including a taken username or an email that already has an account
- **Cloud sync:** per-account slots, offline saves, two-device hand-off, conflicts and their resolution, deletes, pushes racing new saves (against an in-memory fake of the cloud)
- **Maps and tools:** fog of war, the map window, dungeon lookup, dev panel actions

## Project layout

```
index.html, css/style.css
js/
  main.js         boot, title screen, fixed-timestep loop, input → controls, autosave
  game.js         DOM-free simulation: areas (overworld/dungeon), combat, interaction, death
  save.js         serialize/restore, migrations, validation, export/import, save slots
  cloud/          accounts (Supabase Auth), cloud save rows, and the local-cache-plus-cloud sync
  config.js       every tunable constant
  data/           weapons, enemies, items, vendors, drop and chest loot tables
  entities/       player, zombie, projectile
  systems/        combat math, stats, leveling, inventory, economy, consumables, loot, death, regen, spawner, effects
  world/          overworld chunks, tiles, village, dungeon placement and interiors, fog of war, bounds, collision
  ui/             HUD, panels (character, inventory, vendors, stash, chest, trainer, pause, map), title, quick wheel, minimap, dev panel, tooltips, toasts
  render.js       canvas drawing
tests/            node:test suites
supabase/         database migrations (run in the Supabase SQL Editor) and a verification query
designDocs/       design docs
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
| M7 | Maps + polish (minimap, fog of war, dev panel) | ✅ Done |
| M8 | Accounts + cloud saves (Supabase) | 🚧 In review |

### Endless world later

Generation is a pure function of `(seed, x, y)`, built per 32×32 chunk. The fixed 400×400 size is enforced only in `js/world/bounds.js`, so making that check always pass gives an endless world. Saves already key dungeon state by coordinates, so they need no change.
