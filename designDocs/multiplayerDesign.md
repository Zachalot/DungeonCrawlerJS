# Multiplayer — Engineering Design Guide

> Status: Draft v0.1 (planning only; nothing here is built) · Client: browser, vanilla JS, no build step · Server (proposed): Node.js + WebSockets · Database: Supabase Postgres (see `migration-to-persistent-storage.md`)

**What this is:** a guide to the problems of turning the single-player game into a shared world (many players seeing each other, raiding dungeons, and fighting across factions), with a proposed solution for each. It is written to be reread when you decide to take this step, so it explains the reasoning and doesn't assume you remember it.

**How to read it:** §2 is the core idea. §3 is the concrete refactor plan against today's code. §4–§7 cover networking and latency. §8–§12 cover the world, data, security, and scale. §13 is the milestone plan. Items marked **[Default]** are my recommendation where you haven't decided, and any can change. Numbers marked *(estimate)* are back-of-envelope and must be measured before you rely on them.

**Related docs:**
- `dungeon-crawler-design-doc.md` is the single-player game design.
- `migration-to-persistent-storage.md` is the cloud-save plan. §9 here explains which parts of it survive multiplayer and which get replaced.

---

## 1. Overview

### 1.1 Goals
- Many players share one persistent overworld and can see, fight, trade with, and group with each other.
- Party dungeon raids, and faction-vs-faction PvP.
- Stay a browser game: a static client on GitHub Pages plus one or more Node.js game servers.
- Players can't cheat the economy or combat by editing their own client.

### 1.2 Non-goals (for now)
- Thousands of players in one place. The first target is **tens to low hundreds** concurrently.
- Seamless spatial sharding (one continuous world across many servers). See §12.
- Mobile/native clients, voice chat, and a UDP-only transport.
- Open-world player building. Building belongs in owned, size-capped instances (see the "MMO building" discussion in §8.5), not the shared world.

### 1.3 What changes fundamentally
Today the browser runs the whole game and is trusted with everything:

```
TODAY                                   MULTIPLAYER
┌─────────────────────────┐             ┌────────────┐   inputs    ┌──────────────────┐
│ Browser                 │             │ Browser A  │ ──────────▶ │ Node.js server   │
│  input → Game.update    │             │ (renders,  │ ◀────────── │ runs the real    │
│  → render → localStorage│             │  predicts) │  snapshots  │ simulation, owns │
└─────────────────────────┘             └────────────┘             │ all game state   │
                                        ┌────────────┐   inputs    │                  │──▶ Postgres
                                        │ Browser B  │ ──────────▶ │                  │
                                        └────────────┘ ◀────────── └──────────────────┘
```

The browser becomes a **fast, untrusted display and input device**, and the server becomes the game.

---

## 2. The Core Model: an Authoritative Server

### 2.1 Why "relay the actions" doesn't work
The obvious design is that player 1's client says "I shot an arrow at angle X," the server forwards that to everyone, and every client simulates the arrow. That fails because:
- **Cheating is trivial.** The client that says "my arrow hit for 9,999 damage" is believed.
- **Clients drift apart.** Each one simulates independently, so one sees the zombie dead and another sees it alive, and nothing resolves who is right.
- **Shared state has no owner.** Who decides whether two players loot the same chest?

### 2.2 The authoritative model
- Clients send **inputs** (what keys/mouse are doing), never **results**.
- The server simulates the world on a fixed tick and decides every outcome.
- The server sends **snapshots** of what's near each player. Clients draw them.
- Clients may *predict* their own outcomes to feel responsive (§6), but the server's word always wins.

Your code already has the seam this needs. `game.update(STEP, readControls())` takes a plain controls object `{ move, aim, attack, attackPressed, weapon }`. In multiplayer that object is the input message.

### 2.3 Worked example: "player 1 shoots an arrow at me"

| Time (ms) | Where | What happens |
|---|---|---|
| 0 | P1's client | P1 clicks. The client plays the bow-draw animation immediately (prediction) and sends `input { seq: 412, aim, attackPressed }`. |
| ~40 | Server | The input arrives. At the next tick the server checks the cooldown, arrows, and equipped bow, deducts the arrow, and spawns `Projectile #77` (owner P1, angle, speed). |
| ~60 | Server | The tick's snapshot includes event `projectile_spawn #77` and the projectile entity, for every player whose area contains it. |
| ~100 | Your client | The snapshot arrives. Your client puts the arrow in its interpolation buffer and plays it back about 100 ms behind server time (§6.3), so it moves smoothly. |
| ~140 | Server | The arrow overlaps you. The server applies armor, i-frames, and damage, and emits `damage { target: you, amount, x, y }`. |
| ~180 | Your client | You see the arrow arrive, then your HP drop and the red damage number, driven by the server event. |

You can dodge in the real world only if you react to what you see, and what you see is ~100–150 ms old. That's inherent to online games, and §6 is about making it feel fair.

---

## 3. What Runs Where (the refactor plan)

### 3.1 Good news from the current code
- `Game` (`js/game.js`) already has no DOM access. Its doc comment says so.
- Randomness is already **injectable** (`random` is passed into `Game`, `Zombie`, `Spawner`, `mitigate`, `rollDrops`, `rollChestLoot`), so the server can supply its own.
- World and dungeon generation are pure functions of `(seed, coords)`, so the client and server can generate identical terrain from the same seed with no data sent.
- Tests already run under `node --test`, which proves the simulation runs outside a browser.
- Systems such as `inventory.js`, `economy.js`, `leveling.js`, `consumables.js`, and `death.js` are plain functions over a `player` object. They can run unchanged on the server.

### 3.2 What has to change
| Today (`js/…`) | Problem for multiplayer | Change |
|---|---|---|
| `Game` has one `this.player`, one `this.area`, and one `zombies` list | A server hosts many players across many areas (overworld, many dungeon instances) | Split `Game` into a shared `Realm` (world + spawner), a per-area `Room` (overworld channel or one dungeon instance: players, zombies, projectiles), and per-player state. Methods take a `player` argument (`attack(player)`, `damagePlayer(player, raw)`). |
| `this.view` (the camera rect) is used by `Spawner.isInView` | The server has no camera | Replace with "not within the visible-area rectangle of **any** player" using a fixed size. |
| `this.effects` (damage numbers, puffs, swing arcs) lives in the sim | Purely cosmetic | Move to the client. The server emits typed events and the client turns them into effects. |
| `this.events` holds `toast` and `autosave` | Toasts are per-player; autosave is a client trigger | Toasts become per-player outbound messages. `autosave` becomes a server-side persistence trigger (§9). |
| `godMode`, `showHitboxes`, `systems/dev.js`, `ui/devPanel.js` | Cheat surface | Remove from the networked client. Admin tools become server-side commands gated by an account role. |
| `Zombie.update(dt, ctx)` targets `ctx.player` | One player only | Pass a list of players and pick a target (nearest, or highest threat). Aggro and de-aggro consider all players. |
| `Spawner` keys spawning off one player's chunk | One spawner serving many players | Iterate the union of all players' nearby chunks. Despawn a zombie only when it is far from **all** players. |
| `Projectile` has no owner and hits only zombies | PvP and kill credit | Add `id` and `ownerId`; hit players (subject to faction rules) as well as zombies. |
| `Player.renderPosition` / `prevX` interpolate for drawing | Render-only state in a sim object | Keep the movement code. Move interpolation into a client-side wrapper around each entity. |
| Item uids are `i${nextUid++}`, unique per save only | Two players' items can collide once items move between players | Make uids globally unique (e.g. UUID/ULID, or `characterId:counter`). This needs a save-version migration. |
| `game.interact()` mutates state and returns a panel id | State change and UI are mixed | Split into a server action (`interact` command: validates range, mutates) and a client reaction (open the panel the result names). |
| `Math.random` defaults | Predictable on the client, unsafe for loot | The server passes a secure RNG for loot and drops (`crypto`-based). Seeded streams are fine for cosmetic randomness. |
| Fog (`Fog`) is saved with the game | Server doesn't need it | Keep it client-side (§9.4). |

### 3.3 Proposed folder layout
No build step is needed, because ES modules load in both the browser and Node. Group by *where code is allowed to run*, so the rule is visible in the path:

```
shared/            Runs in the browser AND in Node. Pure: no DOM, no Date.now, no Math.random.
  config.js  rng.js
  data/            items, enemies, weapons, vendors, loot tables
  world/           tiles, chunks, collision, dungeon generation, village
  systems/         stats, inventory, economy, leveling, consumables, combat math
  sim/             movePlayer(), attack rules, constants shared by prediction and the server
  protocol/        message types, encode/decode, PROTOCOL_VERSION, quantization helpers
client/            Browser only
  main.js  input.js  camera.js  render.js  ui/…
  net/             socket, clock sync, prediction/reconciliation, interpolation buffers
  RemoteGame.js    the networked implementation of the Game facade (§3.4)
server/            Node only
  index.js         HTTP + WebSocket server
  realm.js  room.js  session.js  tick.js
  ai/zombie.js     enemy AI
  persistence/     Supabase/Postgres access, write-behind, leases
  net/             connection handling, rate limits, snapshot building, interest management
```

The existing single-player game keeps working throughout: its `LocalGame` just imports from `shared/`.

### 3.4 The facade that keeps the UI unchanged
All `ui/*.js`, `hud.js`, and `render.js` read from `getGame()` (`game.player.inventory`, `game.zombies`, `game.grave`, …) and mutate through methods like `game.buy()` and `game.equipToSlot()`. Keep that shape as a **facade** with two implementations:

| | `LocalGame` (today) | `RemoteGame` (new) |
|---|---|---|
| Reads | the simulation's own objects | a client-side mirror kept up to date from snapshots, with the same field names |
| Writes | runs the logic immediately | sends a command to the server and applies the result when it comes back |
| Used for | single-player/offline mode and the unit tests | online play |

This avoids rewriting the UI, and it keeps offline play and the existing test suite.

The one unavoidable UI change: today `game.buy(...)` returns a boolean **synchronously**. Over a network the answer comes later. The rule **[Default]**:
- **Pessimistic** (wait for the server; show a brief pending state) for anything involving gold, vendors, loot, trades, the stash, or death.
- **Optimistic** (apply now, roll back on rejection) for pure inventory shuffling like moving an item between bag slots.

### 3.5 Server-only vs client-only vs shared

| Server only (authoritative) | Client only | Shared (same code both sides) |
|---|---|---|
| Movement authority (the server integrates inputs itself) | Input capture, camera, canvas rendering | World, chunk and dungeon generation (`world/*`) |
| Combat: attack validation, swings, projectiles, damage, i-frames | Cosmetic effects: damage numbers, puffs, swing arcs | `data/*`, `config.js` |
| Enemy AI and spawning | HUD, panels, tooltips, quick wheel, minimap and map rendering | `systems/*` pure math (stats, mitigation, inventory ops) |
| XP, leveling, loot and chest rolls, drops | Prediction, reconciliation, interpolation | Player movement (`movePlayer`), so prediction matches the server |
| Inventory, equipment, vendors, stash, respec, consumables | Fog of war (client-owned, §9.4) | Protocol definitions |
| Death, graves, dungeon enter/exit and instances | Title and auth screens, audio | |
| Persistence | Network connection management | |

---

## 4. WebSockets: How They Work Here

### 4.1 The basics
A WebSocket is one long-lived, two-way TCP connection between the browser and the server, started as a normal HTTPS request that is "upgraded." After that, either side can send a message at any time with no new request.

```js
// Browser
const socket = new WebSocket("wss://game.example.com");
socket.binaryType = "arraybuffer";
socket.onopen = () => socket.send(encodeHello(token));
socket.onmessage = (e) => handle(decode(e.data));
socket.onclose = () => reconnectWithBackoff();
```

```js
// Node (using the `ws` library)
wss.on("connection", (ws, req) => {
  ws.on("message", (data) => session.onMessage(data));
  ws.on("close", () => session.onDisconnect());
});
```

### 4.2 Practical requirements
- **`wss://` (TLS) is mandatory.** GitHub Pages serves over HTTPS, and browsers block insecure `ws://` from secure pages. Use a host that provides TLS or put a TLS proxy (Caddy, nginx) in front.
- **Check the `Origin` header** on upgrade so other sites can't open connections to your server on a player's behalf.
- **Pages can't host the server.** It needs an always-on, stateful process (§12).
- **No auto-reconnect.** The browser won't reconnect for you. The client needs reconnect with exponential backoff.
- **No built-in liveness.** Mobile networks and laptops sleeping leave "half-open" connections. Use heartbeats: the server pings every ~10 s and terminates connections that miss two pongs.
- **Disable Nagle** (`setNoDelay(true)`) on the server socket so small packets aren't held back.
- **Skip per-message compression** for small, frequent messages. It adds CPU and latency for little gain.

### 4.3 The limit: TCP head-of-line blocking
WebSockets are reliable and ordered. If one packet is lost, everything behind it waits for the retransmit, which is a visible hitch on a bad network. Snapshots are mostly "latest state wins," so mitigate:
- Include a tick number and discard late snapshots that are already stale.
- Let the server skip sending a snapshot when a client's socket is backed up (`ws.bufferedAmount` above a threshold), so a slow client doesn't accumulate a queue and fall further behind.

Moving to unreliable transport (WebRTC data channels or WebTransport) is possible later and only changes the transport layer. Start with WebSockets.

### 4.4 Connection lifecycle
1. **Connect** → `hello { protocol, token }`. The Supabase access token goes in this first message, **not** the URL, since URLs end up in logs.
2. **Server verifies** the token (§10.1) and rejects mismatched protocol versions (§12.4).
3. **`welcome`** contains the player id, server time, tick rate, world seed, and the player's full state.
4. **Steady state:** inputs up, snapshots down.
5. **Token refresh:** the client sends a fresh `auth` message before expiry. Otherwise the server closes the session when the token lapses.
6. **Disconnect:** the avatar stays in the world for a grace period (**[Default]** 15 s, longer in combat) so pulling the plug can't escape a fight ("combat logging"). The session can then **resume** with a resume token, otherwise it is saved and removed.

### 4.5 Message design

| Direction | Message | When | Contents |
|---|---|---|---|
| C → S | `hello` / `auth` | connect, token refresh | protocol version, access token |
| C → S | `input` | every client tick (batched) | `seq`, `move`, `aim`, `attackHeld`, `attackPressed`, `weapon` |
| C → S | `cmd` | on player action | `id`, `type` (`interact`, `buy`, `sell`, `equip`, `drink`, `allocate`, `stashMove`, …), args |
| C → S | `ping` | every ~2 s | client timestamp |
| C → S | `chat` | on send | text |
| S → C | `welcome` | after auth | player id, seed, tick rate, full self state |
| S → C | `snapshot` | 15–20 Hz | `tick`, `ackSeq`, nearby entities (enter/update/leave), events |
| S → C | `selfState` | when inventory/stats change | changed fields only, **not** in every snapshot |
| S → C | `cmdResult` | per `cmd` | `id`, ok/reason |
| S → C | `pong`, `kick`, `chat` | | |

**Two kinds of state, two paths.** *Volatile, high-frequency* state (positions, angles, projectiles) rides in the snapshot stream, and a newer one supersedes an older one. *Durable, low-frequency* state (inventory, gold, stats) is sent only when it changes. This keeps snapshots small.

### 4.6 Encoding
- **Start with MessagePack** (e.g. `msgpackr`): near-JSON ergonomics, much smaller, no schema to maintain, easy to debug.
- **Move snapshots to a hand-packed binary format** once measurement says it matters: quantized positions, fixed-width ids, bit-packed flags (§7.3). Keep inputs and commands as MessagePack.
- Always put `PROTOCOL_VERSION` in `shared/protocol/` and validate every incoming message against a schema (§10.2).

---

## 5. The Tick Model

### 5.1 Rates **[Default]**

| What | Rate | Why |
|---|---|---|
| Server simulation tick | **30 Hz** | Plenty for 5-tile/s movement. Half the CPU of 60 Hz and half the input traffic. |
| Client prediction step | **30 Hz**, the same step as the server | Prediction replays inputs, so it must use the same `dt` as the server to match. |
| Client rendering | display rate (60+ fps), interpolated | Already how `main.js` works (`alpha`). |
| Snapshot send | **15–20 Hz** (every 1–2 ticks) | A good bandwidth/smoothness balance. Interpolation fills the gaps. |
| Client input send | 30 Hz | One batch per step. |

Today `UPDATE_HZ = 60`. Moving the networked step to 30 changes little at 5 tiles/s (about 0.17 tiles per step, so tunneling through walls isn't a risk), but re-verify collision feel in MP1. Single-player `LocalGame` can stay at 60.

### 5.2 Server tick loop
```js
// Fixed-step accumulator using a monotonic clock, like main.js, never a bare setInterval.
function tick() {
  for (const session of room.sessions) {
    for (const input of session.drainInputs(MAX_INPUTS_PER_TICK)) {
      room.applyInput(session.player, input);      // shared movePlayer + attack rules
      session.ackSeq = input.seq;
    }
  }
  room.step(STEP);                                 // zombies, projectiles, regen, spawner
  room.history.record(room.tick, room.positions()); // for lag compensation (§6.5)
  if (room.tick % SNAPSHOT_EVERY === 0) {
    for (const session of room.sessions) session.send(buildSnapshot(session));
  }
  room.tick++;
}
```
- **Budget:** 33 ms per tick at 30 Hz. Measure each tick with `performance.now()` and alert when the 99th percentile exceeds a third of the budget.
- **Missing inputs:** if a client sends nothing (tab hidden, lag spike), the server repeats the last input for a short time **[Default]** 150 ms, then treats movement as zero. It never invents attacks.
- **Input flood guard:** cap inputs processed per tick per player, so a client can't sprint faster by sending extra inputs.

---

## 6. Latency Hiding

Real networks add 30–150 ms each way. Without these techniques the game feels like moving underwater. Each technique solves a specific problem.

### 6.1 Client-side prediction (your own movement)
**Problem:** waiting for the server before moving makes every keypress feel 100+ ms late.
**Solution:** the client applies each input to its own player immediately, using the **same shared `movePlayer` code** as the server.

```js
// Every client step
const input = { ...sampleInput(), seq: ++seq };
pending.push(input);
socket.send(encodeInput(input));
movePlayer(me, STEP, input.move, input.aim, area);   // shared with the server
```

### 6.2 Server reconciliation
**Problem:** the server may disagree (a wall the client misjudged, a knockback, a rubber-band).
**Solution:** every snapshot says which input the server has processed (`ackSeq`). The client adopts the server's position for that input and replays the inputs not yet acknowledged.

```js
function onSnapshot(snap) {
  pending = pending.filter((i) => i.seq > snap.ackSeq);
  me.x = snap.you.x; me.y = snap.you.y;                     // authoritative
  for (const i of pending) movePlayer(me, STEP, i.move, i.aim, area); // re-apply the rest
}
```
- If the correction is tiny (< ~2 px), ignore it. If moderate, blend it over ~100 ms. If large (teleport, death), snap.
- This only works if `movePlayer` is **deterministic and shared**. Any divergence shows up as constant rubber-banding, which is why movement code moves into `shared/` first (MP1).

### 6.3 Entity interpolation (everyone else)
**Problem:** other players and zombies arrive 15–20 times a second, so drawing them at the latest position looks jittery.
**Solution:** render remote entities **slightly in the past** (**[Default]** 100 ms, about two snapshot intervals), blending between the two snapshots that bracket that time.

```js
const renderTime = serverNow() - INTERP_DELAY;
const [a, b] = buffer.bracket(renderTime);     // snapshots just before and after
const t = (renderTime - a.time) / (b.time - a.time);
entity.x = lerp(a.x, b.x, t);                  // same for y, and shortest-path for angles
```
- If the buffer runs dry (lost snapshots), extrapolate briefly (≤ 200 ms), then freeze. Never extrapolate far, or entities fly through walls.
- The trade-off is deliberate: other players are displayed ~100 ms behind, in exchange for smooth motion.

### 6.4 What gets predicted

| Thing | Predicted on the client? | Why |
|---|---|---|
| Own movement | **Yes** | The feel of the game depends on it |
| Own attack animation and cooldown start | **Yes** (cosmetic) | Instant feedback on click |
| Own projectile appearing | **Cosmetic only**, then reconciled with the server's projectile id | Hides latency; the server decides if it hits |
| Damage dealt, kills, XP, loot | **No**, wait for the server event | Authoritative outcomes |
| HP, mana, arrows, gold | **No** (server value) | Authoritative |
| Inventory shuffles | Optimistic, with rollback | Cheap to undo |
| Vendor, stash, trade, chest | **No** (pessimistic) | Economy integrity |

### 6.5 Event-driven animation
**Problem:** a snapshot is a *state*, not a *story*. If a player swings a sword between two snapshots, interpolation alone shows nothing.
**Solution:** the server also sends discrete **events** stamped with a tick (`attack_start`, `projectile_spawn`, `damage`, `death`, `level_up`). The client queues each event and fires it when its render time passes that tick, which keeps animations in sync with interpolated positions. Today's `effects.addSwing/addText/addPuff` calls become handlers for those events.

### 6.6 Lag compensation (fairness for hits)
**Problem:** at 100 ms of latency, you aim at where a target *appeared* to be 100–200 ms ago. If the server tests the swing against the target's *current* position, the shooter keeps missing targets that clearly looked hit on their own screen.
**Solution:** the server keeps a short history of recent entity positions (a ring buffer, **[Default]** 300 ms) and, for instant checks like sword arcs, **rewinds** targets to what the attacker was seeing.

```js
// Server, when resolving a melee swing
const seenAt = serverNow() - attacker.rtt / 2 - INTERP_DELAY;
const when = clamp(seenAt, serverNow() - MAX_REWIND, serverNow()); // MAX_REWIND ~200 ms
const targets = room.history.entitiesAt(when);
```
- Cap the rewind so a high-ping player can't reach far back. Favoring the shooter slightly is the standard trade-off, and it can make victims feel "hit around a corner."
- **Projectiles are not rewound.** They are simulated forward in server time like any entity. The server just advances a late-arriving projectile by the input's transit time so lag doesn't weaken your shot.
- Zombies fighting players need no special handling.

### 6.7 Clock synchronization
Interpolation and lag compensation need the client to estimate server time. Every ~2 s the client sends `ping` with its clock, the server replies with its own, and the client keeps a running offset from the samples with the **lowest RTT** (they're the least distorted by queuing). `serverNow() = clientNow() + offset`.

### 6.8 Browser gotchas
- **Hidden tabs are throttled.** `requestAnimationFrame` stops and timers drop to ~1 per second, so inputs stop and the avatar stands still. Decide the policy: **[Default]** when `document.hidden` and the player is outside the village, start a short countdown that auto-logs them out (to the safe-zone-return rule) instead of leaving an AFK avatar to be killed. A Web Worker can keep the heartbeat alive.
- **Garbage collection pauses** can cause hitches. Keep per-frame allocation low in hot paths (reuse snapshot buffers and entity objects).
- **Reconnect and replay:** after a reconnect, discard `pending` inputs and accept the full state in `welcome`.

---

## 7. Interest Management and Bandwidth

### 7.1 Problem
If every client receives every entity, bandwidth grows with the *square* of the player count. Players also shouldn't know about enemies they couldn't possibly see.

### 7.2 Solution: Area of Interest (AOI) on the chunk grid
The world is already divided into 32 × 32-tile chunks. Each client receives only entities in their chunk plus the 8 neighbors (a ~96-tile square, much larger than the ~40-tile screen so things appear before they're visible).

- The server tracks, per client, the set of entity ids it already knows about.
- Each snapshot sends **enter** (full state, new in range), **update** (changed fields only), and **leave** (id only, out of range).
- Entities are bucketed by chunk (a spatial hash), so finding "who is near this client" doesn't scan everything.
- Chat and global events are separate channels, not part of snapshots.

### 7.3 Compact encoding of entities
- Positions as `uint16`/`int32` quantized pixels (the fixed world is 12,800 px, which fits `uint16`; an endless world uses chunk-relative coordinates plus a chunk id).
- Angles as one byte (256 steps is enough for aim art).
- Entity type, state (idle/chase/windup), and flags packed into a byte or two.

### 7.4 Bandwidth estimate *(estimate; measure in MP3/MP8)*
Assume ~60 entities in range, half changing per snapshot, ~10 bytes per changed entity, 20 snapshots/s:
- Down: ~300 B × 20 ≈ **6 KB/s per client**, plus ~1 KB/s of packet overhead.
- Up: ~12 B × 30 inputs/s plus overhead ≈ **2 KB/s per client**.
- Server egress for 1,000 players ≈ 7–8 MB/s, around 60 Mbps. This is why delta encoding and AOI matter, and why data egress is likely your first real hosting cost at scale.

---

## 8. World Model for Multiplayer

### 8.1 Realms, rooms, instances
```
Server process
 └─ Realm "Overworld-1" (shared world; one per "channel")
      └─ Room: overworld  (players, zombies, projectiles for the whole open world)
      └─ Room: dungeon "3_5" instance #A (party 1)
      └─ Room: dungeon "3_5" instance #B (party 2)
```
- The **overworld** is one shared room per realm/channel, partitioned for AOI by chunk.
- Each **dungeon visit** by a party is its own room (an *instance*), created on demand and destroyed when empty. Parties never see each other and don't compete for the chest.
- Every player is in exactly one room at a time. The `Game.area` swap (overworld ↔ dungeon) becomes "move this player between rooms."

### 8.2 Enemies and spawning
- All zombie AI runs on the server, in whichever room a zombie lives in.
- Overworld spawn points activate when **any** player is nearby and not looking. Zombies despawn only when far from **all** players.
- AI cost scales with active zombies × line-of-sight checks. Cap active zombies per room and profile early (§12.2).
- Dungeon zombie restocking on re-entry is naturally per instance.

### 8.3 Shared vs per-player state that exists today

| State | Today | Multiplayer |
|---|---|---|
| `dungeonState` (cleared, chest) | per save | **Per party instance.** Chest loot rolled once per instance, and open questions about shared vs per-player loot (§15). |
| `grave` | one per player, only you can recover | Visible to others? Lootable? A major PvP design decision (§11). |
| `stash` | per player | Stays per player, server-side. |
| `fog` | per save | Per player, client-owned (§9.4). |
| `buyback` | per session | Per session, server-side. |
| Overworld zombie respawn timers | per save | Per realm (shared). |

### 8.4 Safe zones
The village already works as a safe zone for zombies. PvP adds a rule: players inside village tiles can't be damaged and can't attack. Enforce it on the server in `damagePlayer`.

### 8.5 MMO building (links to your earlier concern)
Player-constructed objects belong in **owned instances** (plots/villages) with hard object caps, stored as one row or document per village and loaded on demand, not in the shared world. That's compatible with an infinite procedural overworld, since unmodified terrain costs nothing to store. See `migration-to-persistent-storage.md` §9.1 and §10.

---

## 9. Persistence and Accounts in Multiplayer

### 9.1 The big flip: the server owns the data
The cloud-save plan has the browser write its own save blob to Postgres. That's fine for single player and an exploit in multiplayer (anyone could write 9,999,999 gold). Online:

- Only the **server** writes character data, using a server-only database credential (the Supabase `service_role` key, or a direct Postgres connection). It lives in the server's environment variables and **never** in the repo or the browser.
- Browser database access for online characters becomes **read-only or none**: the client gets its own state over the WebSocket from `welcome` and `selfState`.
- Change the RLS policies on `saves` (or a new `characters` table) to drop the client's insert/update/delete rights.

### 9.2 What survives from the cloud-save plan

| Cloud-save plan piece | In multiplayer |
|---|---|
| Email + password auth, password reset, `profiles` and usernames | **Keeps** as is. The WebSocket handshake verifies the same Supabase token. |
| `saves` table and `jsonb` blob | **Keeps**, but written by the server only. Consider renaming to `characters`. |
| `revision` compare-and-set | **Keeps** and gains a new job: a fence against two servers writing one character (§9.3). |
| `SyncedSaveStore`, `sync.js`, conflict prompts | **Not used online.** They remain for single-player/offline mode. |
| Export/import save codes | **Disabled for online characters** (a duplication and cheating vector). |
| Guest/local mode | Stays as an offline mode, kept in a separate namespace from online characters. A local character can't be uploaded to an online account. |

### 9.3 Persistence rules for the server
- **Write-behind:** keep characters in memory while online, mark them dirty on change, and flush every ~30–60 s plus on disconnect and on graceful shutdown. Write cost is tiny. For example, 1,000 players × ~5 KB per minute is under 100 KB/s *(estimate)*.
- **Immediate, transactional writes** for events where losing 60 seconds is unacceptable or exploitable: trades, rare drops, vendor spending of large sums, death/grave creation, level-ups. Crashing after you receive loot but before saving must not duplicate or lose it.
- **Single-session lease:** a character may be loaded by only one server process at a time. On login the server takes a lease row (`character_id`, `server_id`, `expires_at`) and renews it while online. A second login elsewhere is refused or kicks the first. This prevents the classic dupe where one character runs on two servers and saves from both.
- **Fence with `revision`:** every flush is `update … where revision = $loaded`. A stale writer fails loudly instead of overwriting newer data.
- **Graceful shutdown:** on deploy, stop accepting connections, flush everyone, then exit. Crashes lose at most the flush interval (except for the immediate writes above).

### 9.4 Not everything needs to be trusted
Data that doesn't affect fairness can stay client-owned, saving server work: **fog of war**, UI preferences, key bindings, minimap zoom. The client can save these to Supabase directly under normal per-user RLS. Nobody gains from cheating at their own map.

### 9.5 Schema direction
- Keep the blob for the bounded character (player, inventory, stash, grave).
- Shared and relational data gets real tables when it appears: `factions`, `faction_members`, `guilds`, `villages`, `village_objects`, `trades`, `leaderboard` view.
- Anything unbounded (explored map, player-built objects) is stored as sparse per-region rows, as described in the cloud-save doc §9.1.

---

## 10. Security and Anti-Cheat

**Principle:** treat every byte from a browser as hostile. If your own client can do something, so can a modified one.

### 10.1 Authentication
- Verify the Supabase JWT on connect: check the signature against Supabase's published signing keys (JWKS, via a library like `jose`), the expiry, and the audience. The user id in the token is the account identity. The client never tells the server who it is.
- Rate-limit and size-limit the handshake. Close connections that don't authenticate within a few seconds.

### 10.2 Input validation (the server never trusts a client)
- **Schema-validate every message** and drop or kick on violations. Bound array sizes, string lengths, and numeric ranges, and reject `NaN`/`Infinity`.
- **Speed hacks are impossible by design** because the client sends direction, and the server integrates movement itself. Clamp `move` to a unit vector.
- **Cooldowns, ranges, and resources are enforced server-side:** attack cooldown, arrows, mana, interact distance, shop range. The client's idea of these is cosmetic.
- **Rate limits** per connection for commands, chat, and inputs.
- **Lag-switching / timestamp games:** cap rewind, ignore client timestamps for anything but latency estimation.

### 10.3 Economy integrity
- All gold, item, and stash mutations run server-side inside the command handler, in a transaction for multi-party actions like trades.
- Globally unique item uids (§3.2) and a server-side audit log of item/gold movements, so duplication and bugs can be traced.
- Trading, when added: a two-phase confirm, with both inventories locked during the exchange.

### 10.4 Leaderboards and cheating
Once ranking exists, leaderboard-relevant values are only written from server-side logic. Sanity checks (XP per minute, gold earned per hour) flag anomalies.

### 10.5 Abuse, moderation, and ops hygiene
- Chat: rate limits, a profanity filter or mute, a report command, and admin ban/mute backed by a `profiles.role`/bans table.
- Connection limits per IP and per account, and per-IP rate limits on signups and logins.
- The dev panel (`?dev`) and `window.game` exist only in `LocalGame`.

---

## 11. PvP and Faction Design Problems
These are design questions, not engineering ones, but they decide the data model and rules:

- **Faction model:** how a player gets a faction, whether it can change, and what it costs. Friendly fire rules, and who can enter whose territory.
- **Safe zones and open PvP:** which areas allow PvP. The village is safe today. Do dungeons? Do faction capitals?
- **Souls-style death plus PvP:** your gear drops into a grave. Can an enemy player loot it? If so, losing a fight is very costly. If not, PvP death is nearly free. Options: PvP deaths don't drop gear; graves are lootable only in designated zones; looting takes time and is interruptible.
- **Balance:** INT×3 fireballs and mana scarcity were tuned against zombies, not against people who dodge and heal-potion on a cooldown. Expect a balance pass for PvP (separate damage scaling for player targets is common).
- **Griefing:** spawn camping, killing low-level players, blocking chokepoints. Common mitigations: level-banded PvP, respawn protection (`RESPAWN_IFRAMES` already exists), and fresh-spawn safe zones.
- **Combat log:** disconnecting to escape a fight. The grace period in §4.4 handles this.
- **Kill credit and XP:** who gets credit for a kill (last hit, damage share) when several players are involved. This also matters for party dungeon loot.

---

## 12. Scaling Path

### 12.1 Stages

| Stage | Shape | Rough target *(estimate; measure)* |
|---|---|---|
| **A: single process** | One Node process, one overworld realm, dungeon instances as rooms in the same process | ~50–200 concurrent players |
| **B: multiple channels** | Several processes (or machines), each hosting a copy of the overworld "channel" (as in many MMOs: you're assigned or choose one). Dungeon instances live on any process. A gateway or matchmaker assigns players. | Thousands total, ~100–200 per channel |
| **C: services split out** | Separate gateway, instance allocator, persistence workers, and a shared pub/sub (Redis or Postgres `LISTEN/NOTIFY`) for cross-channel chat, parties, and friends | Larger, only if needed |

**Avoid seamless spatial sharding** (one continuous world split across servers by region, with entities handing off across borders). It is among the hardest problems in the genre. Channels plus instances get you a long way for far less complexity.

### 12.2 CPU and memory
- Node runs the simulation on one thread, so one process uses one core. Scale by running one process per core. `worker_threads` can move heavy work (pathfinding, persistence encoding) off the tick thread, though the sim itself is easier to keep single-threaded and deterministic.
- The likely hot spots are zombie AI line-of-sight raycasts and the AOI/snapshot build per client. Profile with 100+ bots before guessing, and optimize the measured top item (spatial hashing, caching snapshots shared by clients in the same chunk, skipping AI for zombies nobody can see).
- Memory per connected player is small (a character plus buffers), and the world itself is regenerated from the seed.

### 12.3 Database load
- Character writes are low-volume (§9.3). The main risk is a connection storm. Use a pooled connection (Supabase provides one, e.g. Supavisor) rather than one connection per player.
- Reads for leaderboards should come from an indexed view or cached top-N, not per-request scans.

### 12.4 Versions and deploys
- Because the browser loads `shared/` modules from Pages while the server runs its own copy, **client and server can run different code**. Put `PROTOCOL_VERSION` in `hello`. The server rejects old clients with "Please reload," and the server can briefly support N and N-1 during a rollout.
- With no build step or file hashing, browsers cache ES modules aggressively. Add a version query string or hashed file names, so a reload actually fetches new code.
- Roll deploys by draining a process (stop new logins, wait for or move players, flush, restart), not by killing it.

### 12.5 Hosting options *(verify current pricing)*

| Option | Notes |
|---|---|
| **Small VPS** (e.g. Hetzner or similar, a few dollars a month) | Cheapest and simplest for Stage A. You handle TLS (Caddy), restarts (systemd/Docker), and updates. |
| **Fly.io / Railway / Render** | Easy deploys and TLS, WebSocket support, global regions on Fly. Costs more per core. |
| **Cloudflare Durable Objects** | One object per room, with strong single-threaded guarantees. Different programming model, which means a larger rewrite, but attractive for instance-per-party designs. |

**[Default]** Start on a small VPS or Fly.io. Don't commit to infrastructure before MP3 shows what the server actually costs per player.

---

## 13. Milestones

Numbered MP1–MP8 so they don't collide with the other docs. Each should leave the game playable.

| # | Milestone | Done when |
|---|---|---|
| **MP0** | Prerequisites | The cloud-save plan's M1–M3 (Supabase project, schema, accounts) are done, so there's a real auth system to verify on connect |
| **MP1** | Separate the simulation (no networking) | `shared/`, `client/`, `server/` folders exist; the simulation supports many players and rooms; `Game` is wrapped as `LocalGame`; effects and toasts are driven by typed events; item uids are globally unique; no gameplay code reads `view`, `window`, or `Math.random` directly; `node --test` is green and single-player plays identically |
| **MP2** | Server skeleton | A Node server accepts WebSocket connections with Supabase auth; one player plays the full loop against `localhost` through `RemoteGame` (no prediction yet); the protocol has a version and schema validation |
| **MP3** | Two players in view | Inputs and snapshots work; clock sync and interpolation; remote players render with name tags; AOI by chunk with enter/update/leave; two browsers see each other move smoothly |
| **MP4** | Prediction + latency tooling | Own movement is predicted and reconciled; a network conditioner (artificial delay, jitter, loss) is built into the client; the game plays acceptably at 150 ms RTT and 2% loss |
| **MP5** | Combat sync | Server-owned attacks, projectiles, damage, and kills; event-driven animations; lag compensation for melee; zombies target multiple players; two players can kill zombies together |
| **MP6** | Server-owned persistence + instances | RLS flipped (client can't write online characters); write-behind with immediate transactional writes; session lease and revision fencing; dungeon party instances; export/import disabled online |
| **MP7** | PvP, factions, social | Faction rules and safe zones enforced server-side; chat; kill credit; reporting and admin tools; rate limiting and anti-abuse; a decision recorded for grave looting |
| **MP8** | Scale and operations | A bot-based load test reports tick time, bandwidth, and capacity per process; metrics and logs in place; graceful deploys with protocol versioning; Stage B channel assignment if load demands it; backups and restore tested |

### MP1 in detail (the foundation, and the largest risk)
This is mostly mechanical but touches many files, so do it in small commits with tests green after each:
1. Move pure modules into `shared/` and fix imports (no behavior change).
2. Replace default `Math.random` params with explicit injection at the top (`LocalGame`), removing the defaults in `shared/`.
3. Replace `effects` calls in the sim with events pushed to a typed queue; client turns them into effects.
4. Replace `this.player` with a `players` map plus a `player` argument on methods; keep a one-player wrapper so existing callers still work.
5. Introduce `Room` (overworld/dungeon) and move `zombies`, `projectiles`, and `Spawner` into it.
6. Add `RemoteGame` stubs only when MP2 begins. Don't build it before the server exists.
7. Add the save-version migration for globally unique uids.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| **MP1 refactor breaks single-player** | Small commits, tests after each, `LocalGame` kept as the regression reference |
| **Prediction mismatch (constant rubber-banding)** | Share one `movePlayer`; same step and constants on both sides; a replay test that runs identical inputs through client and server and diffs positions |
| **Combat feels unfair at high ping** | Interpolation delay, capped lag compensation, and the MP4 network conditioner so it's tested before players find it |
| **Tick time exceeds budget** | Per-tick timing metric from MP2; cap zombies per room; profile before optimizing; scale out by process |
| **Duplicated items and gold** | Server-only writes, transactional trades, globally unique uids, leases, revision fencing, audit log |
| **Cheating and bots** | Server authority, validation, rate limits, anomaly checks; accept that bots can't be fully prevented in a browser game |
| **Free-tier and hosting limits** | A paid host for the game server from the start; Supabase on a paid plan once testers depend on it |
| **Stale clients after deploys** | `PROTOCOL_VERSION` handshake and cache-busted module URLs |
| **Scope creep into a true MMO** | Stage A target of tens to low hundreds; channels and instances before any spatial sharding |
| **Operational burden** | Keep one process and a simple host until load proves otherwise. Automate deploy and flush-on-shutdown early |

---

## 15. Open Questions

1. **Framework vs custom.** Build the thin server layer yourself on `ws` **[Default]**, which fits your existing simulation and keeps control, or adopt a framework like **Colyseus**, which provides rooms, matchmaking, and delta state sync out of the box and could shorten MP2–MP3 at the cost of fitting your sim to its schema model?
2. **Tick rate.** 30 Hz server/client step with 15–20 Hz snapshots **[Default]**, or keep 60 Hz?
3. **Hosting.** Small VPS **[Default]**, Fly.io, or Cloudflare Durable Objects?
4. **Dungeon loot.** One chest roll shared by the party, or per-player loot? What about kill credit and XP sharing?
5. **Graves in PvP.** Can enemy players loot a grave? In which zones?
6. **Offline mode.** Keep a local single-player mode **[Default]**, separate from online characters, or go online-only?
7. **Hidden-tab policy.** Auto-logout outside the village after a countdown **[Default]**, or leave the avatar in the world?
8. **Channels.** Players choose a channel, or are auto-assigned **[Default]**? Can friends join each other's channel?
9. **Movement model.** Keep the smooth, pixel-based movement with prediction **[Default]**, or simplify to tile-stepped movement (much easier to network, but a gameplay change)?
10. **Server language.** JavaScript **[Default]**, which shares the simulation code directly with the browser, or TypeScript on both sides to catch protocol mismatches earlier (introduces a build step)?

---

## 16. Habits to Keep Now (cheap insurance)
Until multiplayer starts, these keep the eventual refactor smaller:
- Keep simulation code free of DOM, `window`, and canvas access (already true of `Game`).
- Keep input as plain data (`readControls()` already is).
- Pass randomness in rather than calling `Math.random()` inside game rules.
- Don't add new code that assumes exactly one player or one area (a global "the player" or "the zombies").
- Put cosmetic-only state (screen shake, damage numbers) behind events, not inside gameplay objects.
- Avoid new UI that depends on synchronous return values from game methods for things involving gold, loot, or shops.
- Add item and character fields through the existing save `migrate()` chain, so nothing is stored in an unversioned shape.
