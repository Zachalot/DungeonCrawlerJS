# Dungeon Crawler JS

A top-down 2D dungeon crawler RPG proof of concept in vanilla JavaScript, HTML, and CSS. No framework and no build step. Sign in to keep your saves in the cloud (Supabase), or play without an account and keep them in your browser's `localStorage`.

## ▶ Play it

**https://zachalot.github.io/DungeonCrawlerJS/**

That's the latest `main`, deployed by GitHub Pages about a minute after each merge. If you just merged and don't see the change, wait a minute and hard-refresh (Ctrl+Shift+R / Cmd+Shift+R).

See [designDocs/dungeon-crawler-design-doc.md](designDocs/dungeon-crawler-design-doc.md) for the full design, [designDocs/migration-to-persistent-storage.md](designDocs/migration-to-persistent-storage.md) for accounts and cloud saves, [designDocs/progression-and-crafting.md](designDocs/progression-and-crafting.md) for leveling, enemy scaling, bosses, runes, and crafting, and [designDocs/multiplayerDesign.md](designDocs/multiplayerDesign.md) for future multiplayer plans.

## How to play

You start in the walled village, where monsters can't reach you. Gear up, head into the wilderness, and find dungeons; there's about one every 50 tiles. The world is endless, and everything gets one level tougher every 50 tiles from the village. Clear a dungeon to reach the treasure chest in its farthest room, then climb the escape rope beside it straight back to the surface. If you die, your armor, bag, and arrows drop into a grave where you fell. Walk back and press F to recover them. Die again before you do, and the first grave is gone for good.

Every 16 levels you'll hit a wall: monsters past it are much tougher than more levels can make up for. Bosses guard some dungeons from level 5 and drop runes. Apply runes to your gear at an Enchanting Table you build in the village, and that's how you break through.

| Input | Action |
|---|---|
| WASD / arrow keys | Move |
| Mouse | Aim |
| Left click / Space (hold) | Attack |
| 1 / 2 / 3 | Sword / Bow / Staff |
| Hold Q | Potion wheel: point at health, mana, or travel and release Q to use it; release in the middle to cancel. Scroll while pointing to pick which level of potion it uses |
| I | Inventory: drag gear onto the stick figure to equip it |
| C | Character sheet (spend stat points) |
| M | Full-screen map of everywhere you've explored: scroll to zoom, drag to pan |
| F | Interact: talk, open, enter, descend, climb, recover |
| Hold F | Chop a tree (axe) or mine a rock (pickaxe) |
| B | Build menu (in the village): Enchanting Table, Potion Table |
| Esc | Pause menu, or close the open panel |
| ` (backtick) | Dev panel (local play, or add `?dev` to the URL) |

| Weapon | Damage | Cost | Notes |
|---|---|---|---|
| Sword | STR × 1 | free | 90° cleave with 1.7-tile reach, knockback, 0.4 s |
| Bow | floor(DEX × 1.5) | 1 arrow | 8-tile range, 0.6 s |
| Staff | INT × 3 | 5 + 1.5 × INT mana | 7-tile range, 0.8 s. Hits hardest, but a full mana bar holds only about 6 casts, and mana only regenerates in the village |

- **Monsters** match the level of where they are: level 1 near the village, +1 every 50 tiles. A level 1 zombie has 10 HP and deals 2 damage; HP grows by half and damage by about a third of that per level, with a big jump at every wall (17, 33, 49, …). Watch for the red windup: stepping back before it ends dodges the hit. Monsters can't enter the village.
- **Slimes** hop: green ones (tanky) from level 2, red (hit hard, fragile) from 3, blue from 4. They drop goop for brewing potions.
- **Leveling:** a monster gives 10 XP × its level (more for slimes and bosses), less if it's below your level. Leveling gets steadily slower: each level needs `50 × level × 1.08^(level − 1)` XP and grants 3 stat points.
- **Ranged weapons are a resource.** The sword is free; arrows cost 1.5 g × your level each, and mana comes from potions outside the village. Put points in Strength: a pure archer or mage won't get far.
- **Dungeons** get more floors from level 4 (take the stairs down); each floor has at most two kinds of monster. Saving inside a dungeon resumes on the floor you were on. From level 5, a dungeon may have a **boss** in its treasure room (the first boss-level dungeon always does). Bosses drop runes, and higher-level bosses drop more of them. A chest opened after its boss dies holds twice the loot.
- **Runes and enchanting:** each boss type drops its own rune (Centaur → Strength, Golem → Endurance, Giant Slime → Intellect, Giant Cat → Dexterity). At the Enchanting Table, a rune adds +3 to that stat on a piece of gear for 75 g × your level. A table of level N holds N runes per piece; upgrade it with more stone and wood. You can also convert 4 runes of one type into 1 of another (40 g × your level).
- **Gathering:** buy an axe and pickaxe from the General Vendor, then hold F next to trees and rocks for 3–5 wood or stone each (in your pouch, not your bag). They grow back after a few minutes. Your Gathering skill levels as you harvest and gives a growing chance of a bonus harvest.
- **Potions have levels.** A health potion of level N heals 25 + 10 × (N − 1); mana restores 25 × N. The Potion Vendor sells your level and the two below it; brew them cheaper at a Potion Table with goop. **Travel potions** take you to the village, or to a dungeon you've visited up to the potion's level.
- **Enchanted gear is at risk:** when you die, an enchanted starter weapon goes into your grave like any other gear (plain starters stay with you).
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
- **Enemies:** AI states, windup timing, de-aggro, level scaling and walls, slimes hopping, bosses, drops and runes, spawning by level and respawn timers
- **Progression:** XP and leveling, stat allocation, respec, drops, regen
- **Items:** inventory stacking, equipment, potions, vendors, buyback, stash
- **Dungeons:** every floor of every nearby dungeon (stairs, treasure room, enemy mix), chest loot weights and boss bonus, enter/exit, floors, the first boss, loot persistence and overflow
- **Death and saving:** graves and the one-grave rule, save round-trips (including floors, pouch, runes, structures), migrations through v4, validation, export/import, save slots
- **Crafting:** gathering and regrowth, village structures (placement rules, building, moving, upgrading), enchanting and rune conversion, brewing, enchanted gear on death, travel potions
- **Accounts:** sign-up outcomes, including a taken username or an email that already has an account
- **Cloud sync:** per-account slots, offline saves, two-device hand-off, conflicts and their resolution, deletes, pushes racing new saves (against an in-memory fake of the cloud)
- **Maps and tools:** fog of war, the map window, dungeon lookup, dev panel actions

## Balance simulation

[tools/balance.js](tools/balance.js) plays each build (warrior, berserker, spellblade, skirmisher, archer, mage, balanced) from level 1, dungeon by dungeon. It uses the game's real damage, HP, and armor formulas, plus proposed numbers for enemy scaling, XP, gold, arrows and mana, gathering, the enchanting table, and runes. It shows where each build hits a plateau (a "wall" every 16 levels), and how many bosses, dungeons, and hours it takes to break through. The design it tunes is in [designDocs/progression-and-crafting.md](designDocs/progression-and-crafting.md).

```bash
npm run balance
```

- `-- --build mage` shows one build's level-by-level table (default: warrior).
- `-- --solve` fits the wall heights so a warrior needs about 4 bosses at the first wall and 10 at later ones.
- `-- --set xpCurve=1.15 --set runeBonus=2` tries numbers without editing the file.
- `-- --csv balance.csv` writes every build and level to a spreadsheet.

The proposed numbers live in the `P` block at the top of the file. It's a planning tool: nothing in the game reads it.

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
tools/            balance simulation (npm run balance)
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
| M8 | Accounts + cloud saves (Supabase) | ✅ Done |
| M9 | Endless world, monsters and scaling, bosses and runes, enchanting, gathering, potion levels and brewing, multi-floor dungeons | 🚧 In review |

### The endless world

Generation is a pure function of `(seed, x, y)`, built per 32×32 chunk as you explore, in every direction (negative coordinates too). Saves store only what you changed: explored fog, dungeon state, harvested trees and rocks (until they regrow), and village structures.
