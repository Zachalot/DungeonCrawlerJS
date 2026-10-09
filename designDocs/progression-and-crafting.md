# Progression, Scaling, and Crafting — Design Doc

> Status: **Implemented** (v0.2, branch `craftingAndMonsters`) · Covers issues [#13](https://github.com/Zachalot/DungeonCrawlerJS/issues/13) (enemies and scaling), [#15](https://github.com/Zachalot/DungeonCrawlerJS/issues/15) (enchanting and potions), and parts of [#14](https://github.com/Zachalot/DungeonCrawlerJS/issues/14) (travel potions) and [#4](https://github.com/Zachalot/DungeonCrawlerJS/issues/4) (vendors) · Numbers are tuned with `npm run balance` ([tools/balance.js](../tools/balance.js))

**Changes in v0.2 (implementation):** everything below is built. The numbers live in `js/config.js` and `js/data/`, and `tools/balance.js` now reads them from there, so the doc, the game, and the model can't drift apart. Where the build differs from v0.1:
- **The world is endless.** The old 400 × 400 world topped out at dungeon level 6, so the walls at 17, 33, and 49 were unreachable. Levels keep rising every 50 tiles in every direction.
- **Level 1 enchanting table: 40 stone + 30 wood** (was 50 stone). Dungeons have two floors from level 4, so each trip gives twice the kills; players reach wall 17 in about 4 trips, when 50 stone isn't gathered yet.
- **Wall heights re-fit with the game's real numbers:** ×3.16, ×1.67, ×1.05.
- **Health potions heal 25 + 10 × (N − 1)**, not 10 × N: 10 × N was a weak 20% of HP at level 1. Mana stays 25 × N.
- **Potion prices:** the vendor charges 20 × N gold (travel 50 × N); brewing costs 10 × N gold plus goop, so brewing is the cheaper way.
- **Floors:** 1 below level 4, 2 from 4, 3 from 10 (`DUNGEON_FLOORS`).
- **Bosses are rolled per visit** (30%, or always until the player has killed one). Re-entering a dungeon doesn't guarantee its boss again. The four bosses differ in speed, size, and toughness.
- **Building:** press B in the village to open the build menu. One of each table, placed anywhere on open floor inside the walls (not the wall ring, so gates stay open). Moving a table is free.
- **Materials, goop, and runes go in a pouch**, shown in the inventory, not the 24-slot bag. The axe and pickaxe sit in the bag (10 g each from the General Vendor).
- **Harvested trees and rocks regrow after 300 s of play**, but never while you're standing next to them.

**What this is:** the decisions from planning the leveling curve, enemy scaling, runes and enchanting, gathering, ranged resources, and potions. **Where this doc and the issues disagree, this doc wins.** In particular, it replaces #15's leveled runes and its formula `(rune level × count + others) / 2`.

**Numbers:** every number below is the current value in the `P` block of `tools/balance.js`, which plays each build through the game using the game's real combat formulas. Change a number there, rerun, and then update this doc. Items marked **[Default]** are my proposal where you haven't decided.

---

## 1. The Core Loop: Walls Every 16 Levels

Leveling alone can't keep up forever. **Every 16 levels the player hits a wall** (at dungeon levels 17, 33, 49, …): a jump in enemy HP that more levels don't overcome. Runes from bosses, applied at the enchanting table, give the power spike that breaks it. Then the player levels until the next wall.

- **The first wall (17) is a teaching wall:** about **4 bosses** to break. It exists to teach enchanting, and must never feel like the game is broken.
- **Later walls take about 10 bosses** beyond the runes already collected on the way.
- **Levels can't substitute for runes:** the simulation's "levels alone" check shows a warrior would need about level 34 to break wall 17 without new runes, and level 64 or more for later walls. Wall 49 is sensitive: its small step (×1.05) puts it at about 7 bosses, not 10.
- **Wall height** is the multiplier on enemy HP at each wall: currently ×3.16, ×1.67, ×1.05 (`WALL_HP_STEPS`), fitted with `npm run balance -- --solve`. Later walls need smaller jumps because players arrive with far more runes. If the XP curve changes, re-fit the walls.

Before the first wall, the player must have (all three are tested in `tests/balance.test.js`):
1. **Found at least one rune.** The first boss-level dungeon (level 5) **always has a boss**.
2. **Seen what runes are for.** When the first rune drops, show a prompt along the lines of: "You found a Centaur Rune! Build an Enchanting Table in the village to use it."
3. **Been able to build a table.** Gathering during normal play brings in the 40 stone + 30 wood for a level 1 table by about dungeon 4, when a warrior reaches the first wall (at about level 19). That's a tight margin; playtest it.

At the current XP curve, the first wall arrives after about **24 minutes** and 5 dungeons. That's accepted as is.

---

## 2. Enemies

### 2.1 Scaling with level
An enemy of level E has `level-1 stat × (1 + growth × (E − 1))`, times the wall multipliers it has passed:

| Stat | Growth per level | Level 1 → 10 → 16 (zombie, before walls) |
|---|---|---|
| HP | 0.5 | 10 → 55 → 85 |
| Damage | 0.35 | 2 → 8.3 → 12.5 |

Damage grows slower than HP on purpose. The player's HP only grows through Endurance, which competes with every other stat. Overworld monsters use the same level as the dungeons at that distance from the village.

### 2.2 Types
| Type | HP | Damage | XP | First appears | Drops |
|---|---|---|---|---|---|
| Zombie | 1× | 1× | 1× | level 1 | gold, sometimes arrows |
| Green slime | 2× (tanky) | 1× | 1.5× | level 2 | 50% green goop, 10% gold = 3 × level |
| Red slime | 0.7× | 2× | 1.5× | level 3 | 50% red goop, 10% gold = 3 × level |
| **Blue slime** | 1.3× | 1.3× | 1.5× | level 4 | 50% blue goop (for mana potions), 10% gold |
| Boss | 12× | 3× | 15× | level 5, in 30% of dungeons | runes (§4), better chest loot |

Multipliers are relative to a zombie of the same level. Blue slimes fill the gap in #15: nothing dropped blue goop.

### 2.3 Multi-floor dungeons (from level 4)
- From level 4, dungeons have **several floors**, with **at most 2 enemy types per floor**.
- The **final room** (boss and chest) has an **escape rope** that goes straight back to the surface, replacing the ladder.
- **Saving inside a dungeon resumes at the current floor**, not the entrance, so long dungeons aren't replayed from the top. This needs a save-format change: the floor number, plus that floor's state.

---

## 3. XP and Gold

- **XP per kill** = zombie XP (10) × enemy level × the type's XP multiplier.
- **XP to the next level** = `50 × level × 1.08^(level − 1)`: exponentially slower.
- **XP falloff:** −25% per level the player is above the enemy, down to a 10% floor. This stops players breaking walls by grinding easy dungeons.
- **Gold per kill** averages 2 × enemy level; a boss gives 30 × level.
- **Gold has to be spent**, mainly on enchanting (§4.3). With these costs, a warrior's bank stays around a few thousand gold rather than piling up to hundreds of thousands.

A later "reset the world from level 1 at a harder difficulty, keeping skills plus a reward modifier" mode is out of scope here and gets its own milestone.

---

## 4. Runes and Enchanting

### 4.1 Runes
- **One rune type per boss type, with no rune levels:** centaur → Strength, golem → Endurance, giant slime → Intellect, giant cat → Dexterity.
- **Each applied rune adds +3** to its stat (`runeBonus`).
- **Higher-level bosses drop more runes:**

| Boss level | 5 | 6 | 7 | 8 | 9 | 10 | 11+ |
|---|---|---|---|---|---|---|---|
| Chance of an extra rune | – | 15% | 35% | 60% | 85% | always 2 | same pattern: 2 guaranteed, then a growing chance of a 3rd, and so on |

### 4.2 The enchanting table
- **Table level = runes per gear piece.** A level 1 table allows 1 rune on each of the 8 pieces (5 armor + 3 weapons), a level 2 table allows 2, and so on.
- **Building or upgrading to level N** costs 40 × N stone + 30 × N wood. Upgrade in place: nothing is demolished or lost. The player just gathers more for each level.
- **Placement:** anywhere in the village that's free. A level 1 table takes 2 tiles. Players are responsible for not blocking themselves in.
- Enchants are **not slot-specific:** +3 Strength on boots equals +3 Strength on a sword.

### 4.3 Gold costs
| Action | Cost |
|---|---|
| Apply a rune | 75 × player level |
| Convert 4 runes of one type into 1 of any type | 40 × player level (+ the apply cost when it's applied) |

With conversion, about 44% of drops can go to the player's main stat, compared with 25% from drops alone.

### 4.4 Death and enchanted gear (changes the main design doc §11)
- **Unenchanted starter weapons** are simply replaced on respawn. They aren't buried, so the grave and bag stay uncluttered.
- **An enchanted starter weapon counts as a real weapon.** It goes into the grave with everything else, and the player respawns with fresh starters. Without this rule, everyone would enchant the starter sword so it can never be lost.

---

## 5. Gathering

- **Pickaxe for rocks, axe for trees,** each 10 g from the vendor.
- **Yield:** a tree gives 3–5 wood and a rock 3–5 stone. Rocks get the same yield as trees because they're rarer (3% of tiles vs 5%) and tables need more stone than wood.
- **Hold F** for about a second to harvest. There's no menu.
- **A materials pouch,** like the arrow quiver, so wood and stone don't take bag slots.
- **Nodes regrow** on a timer, like zombie spawns. Only recently harvested nodes are saved, which keeps the world's saved changes bounded (see the persistence doc §9.1).
- **Materials come from exploring,** not dedicated trips. The simulation assumes about 8 nodes per dungeon trip.
- **Gathering skill:** levels up as you harvest (one level per 20 nodes in the model) and adds **+2% chance of a bonus harvest** per level, up to 50%. **Harvest speed doesn't come from the skill.** It comes from better pickaxe and axe tiers in a later milestone.
- **No separate Construction skill:** materials already limit how fast tables are built.

---

## 6. Ranged Weapons Are a Resource; the Sword Is Free

**Rule:** the sword is the main weapon. The bow and staff are powerful but cost resources, so players use them sparingly. **Pure ranged builds run into serious problems and are forced to invest in Strength.** This is intentional.

| Resource | Rule |
|---|---|
| Arrows | 1.5 × player level gold each (today: 0.5 g). Rare drops from zombies. |
| Mana per cast | `5 + 1.5 × INT`, so a full bar (10 × INT) holds **about 6 casts** however much Intellect a player has. More Intellect means harder hits, not more of them. |
| Mana | Refills only in the village (as today) or from mana potions (§7). |

**The tuning principle:** a ranged kill should cost about as much gold as the kill pays out. Spamming then breaks even at best, and every coin spent on ammo is one not spent on enchanting, which is what breaks walls.

What the simulation shows:
- A pure mage or archer manages only 25–40% of kills at range and gets stuck at the first wall.
- Hybrid builds (Strength first, some Intellect or Dexterity) never use ranged when the sword is faster. For them the bow and staff become **tactical tools**: opening on bosses, fighting at a distance, finishing runners. The simulation measures only kill speed, so playtesting has to judge that role.

---

## 7. Potions

- **Potions have levels.** A level N **health** potion heals 25 + 10 × (N − 1) HP: half of a fresh character's HP at level 1, and about 70–90% of a warrior's at their own level later. A level N **mana** potion restores 25 × N mana.
- Players should carry about 3 levels at a time, use them up as they level, and sell outdated ones back.
- **Crafting** at the potions table costs goop plus 10 × N gold; the vendor charges 20 × N (travel potions 50 × N). Recipes from #15: health = 1 red goop × N, mana = 1 blue goop × N, travel = (3 red + 3 green goop) × N. The vendor sells them for more than crafting costs.
- **Travel potions (#14)** must be at least the level of the dungeon you travel to. A level 1 potion always returns you to the village. Vendor price is 50 × level.
- **Quick wheel:** players choose which level of health and mana potion each segment uses (scroll or right-click a segment to cycle). The choice is remembered. If nothing's chosen, or the chosen level runs out, the wheel uses the **highest level** carried.

---

## 8. Village Building

- Tables are placed freely, with no fixed build plots. Later the player can build floor tiles and walls to expand the village.
- **Player-built village tiles count as safe zone,** the same as the original village tiles: zombies can't enter them and they block PvP.

---

## 9. Open Questions

1. **Potion vendor unlock (#4):** potions unlock with a level 3 dungeon, but mana only refills in the village. Early staff use depends on starting potions until then. Sell minor potions from the start **[Default]**, or give a larger starting kit?
2. **Pricing by player level:** arrows and potions priced by *player* level make over-leveled players pay more for the same dungeon. Price by item level instead (arrows with levels, like potions)?
3. **Which boss drops which rune:** random boss type per dungeon **[Default]**, or let players target a boss type (e.g. by dungeon region)? Targeting would reduce the need for conversion.
4. **Off-stat runes:** the model puts all of a build's runes into its damage stat. Warriors will also want Endurance runes, which take table slots. Is the table capacity (8 × level) enough?
5. **The table margin before wall 17 is tight** (built at about the same dungeon the wall arrives, even at 40 stone). Lower the cost again, or start players with a few materials?
