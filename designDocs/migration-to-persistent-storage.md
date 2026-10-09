# Migration to Persistent Storage — Design Doc

> Status: Draft v0.3 · Backend: Supabase (Postgres + Auth) · Client: browser, vanilla JS, no build step · Supersedes: the "Databases or servers" non-goal in the main design doc (§1.2)

**Changes in v0.3:** added §3.3 (how Supabase Auth works: storage, password hashing, sign-up/sign-in/reset flows, tokens, session persistence, browser security) and §3.6 (what custom SMTP is, and the Gmail-app-password vs own-domain options).

**Changes in v0.2:** accounts are now email + password with a display username and emailed password reset, instead of username-only login; Google sign-in is deferred to the backlog (§10); M1 adds custom SMTP setup; added §9.1 on save size for an endless world.

**What this is:** moves save slots from `localStorage` to a Supabase Postgres database, tied to a player account. Testers sign in from any browser and pick up where they left off, with no seed to remember. Items marked **[Default]** are my choice where you haven't decided. Change any of them freely.

**Milestone numbering:** M1–M6 here are independent of M1–M7 in `dungeon-crawler-design-doc.md`.

**Save format:** this plan does **not** change the save shape or bump `SAVE_VERSION`. The save blob is stored as-is in a `jsonb` column, and the existing `migrate()` / `validateSave()` keep running on the client. (The main design doc §13.1 describes v3, but `js/save.js` on this branch is v2. Whichever version is current when you start M4 is the one that gets stored.)

---

## 1. Overview

### 1.1 Goals
- **Accounts:** sign up with an email, password, and username; sign in; reset a forgotten password by email. Google sign-in comes later (§10).
- **Cloud saves:** the three slots live in Postgres per account and follow the player across browsers and devices.
- **Keep what works:** local play still works offline, saves still write instantly, and export/import stays as a backup tool.
- **Leave room to grow:** leaderboards, crafting, player-built villages, and multiplayer should be additive (new tables, not a rewrite). See §10.

### 1.2 Non-goals (for now)
Leaderboards, multiplayer, server-side validation of saves (anti-cheat), a game server, payments, Google/OAuth sign-in, and social features. The save blob is trusted client data until there's a reason not to trust it (§9).

### 1.3 Why this fits the existing code
`js/save.js` already serializes the whole game into one versioned JSON document, and `SaveStore` is a thin wrapper over a storage object. The cloud is the same document in a different place. The work is the account layer and an async sync layer around the existing synchronous store.

---

## 2. How Supabase works (the 2-minute version)

You already have a project (`izutqcgxepfpqeffuetn`), and **that project is your database.** There's nothing separate to create.

| Dashboard area | What it is | You'll use it for |
|---|---|---|
| **SQL Editor** | Run SQL against the project's Postgres | Applying the migrations in §5 |
| **Table Editor** | Spreadsheet-style view of tables | Checking that saves are landing |
| **Authentication** | Users, sign-in providers, URL settings, email/SMTP | Setting redirect URLs, configuring email delivery |
| **Project Settings → API** | Project URL and API keys | Getting the two values the game needs |
| **Database → Schemas** | The page you linked | Browsing tables; you don't need to do anything here |

**How the browser talks to it:** the game calls Supabase directly using the **project URL** and the **publishable (anon) key**. Both are designed to be public and are safe in client code and in git. What protects the data is **Row Level Security (RLS):** rules in Postgres saying "a signed-in user can only touch rows where `user_id` is theirs." **Never** put the `service_role` / secret key in the game's code; it bypasses RLS.

**Free plan caveats (verify current limits before relying on them):** projects pause after about a week of inactivity, and the plan has a small database size cap and limited auth emails. A save is a few KB, so size isn't a concern at tester scale. A paused project makes the game fail to sync until someone resumes it from the dashboard, and the local cache (§6.2) keeps the game playable meanwhile.

---

## 3. Accounts and Authentication

### 3.1 Sign-in method

**Email + password, with a separate display username.** Players sign up with an email, a password, and a username. They sign in with email + password. The username is only their public name (leaderboards, villages later).

- **Password reset:** "Forgot password?" on the sign-in form calls `resetPasswordForEmail(email, { redirectTo })`. The emailed link returns to the game in a recovery state, where a "Choose a new password" form calls `updateUser({ password })`.
- **Email delivery** needs a custom SMTP setting in the dashboard, with no code of ours. See §3.6.
- **[Default]** Email confirmation is **on** once SMTP works, so a typo'd address can't make an account that can never reset its password. While SMTP is still being set up, it can be off for your own testing. Turn it on before inviting testers.
- **Google (OIDC) is deferred** (§10). It's additive: the `profiles` table and sync layer don't change, and it only needs a provider toggle, a Google Cloud OAuth client, a "Continue with Google" button, and a "choose a username" prompt for accounts that arrive without one. That's why `profiles.username` stays nullable.

### 3.2 Usernames
- Format: 3–20 characters, `A–Z a–z 0–9 _`, **case-insensitively unique** (enforced by a unique index on `lower(username)`).
- Stored on `profiles.username`. Leaderboards will show this later.
- Collected on the sign-up form and passed as sign-up metadata, which the database trigger copies into `profiles`.
- Sign-up checks availability first via the `username_available()` RPC (§5), so the error is friendly. The unique index is still the real guard against races.

### 3.3 How authentication works (no backend code of ours)

#### 3.3.1 Supabase Auth *is* the backend
Every Supabase project comes with a hosted authentication server (Supabase Auth, based on the open-source GoTrue) at `https://izutqcgxepfpqeffuetn.supabase.co/auth/v1`. It handles sign-up, sign-in, password hashing, tokens, password-reset links, and sending email. The game talks to it from the browser through `supabase-js`. **We write and host no server code.** GitHub Pages keeps serving static files, and everything that must be secret or trusted happens inside Supabase.

```
Browser (GitHub Pages)                Supabase (hosted for you)
┌──────────────────────┐   HTTPS     ┌──────────────────────────────┐
│ game + supabase-js   │ ──────────▶ │ Auth server  (/auth/v1)      │──▶ SMTP provider ──▶ player's inbox
│                      │             │ Data API     (/rest/v1)      │
│                      │ ◀────────── │ Postgres (auth.* + public.*) │
└──────────────────────┘             └──────────────────────────────┘
```

#### 3.3.2 What is stored, and where

| Data | Where | Who can read it |
|---|---|---|
| Email, confirmation time, last sign-in | `auth.users` (Supabase-managed schema) | Only Supabase Auth and the dashboard. The `auth` schema isn't exposed to the browser API. |
| Password | `auth.users.encrypted_password`, as a **bcrypt hash** (despite the column name, it's a one-way hash, not reversible encryption) | Nobody, including you. It can only be checked, never read back. |
| Sessions and refresh tokens | `auth.sessions`, `auth.refresh_tokens` | Supabase Auth |
| Username | `public.profiles` (ours, §5.1) | Signed-in players (for leaderboards later). **No email is ever copied here**, so a leaderboard can't leak addresses. |
| Saves | `public.saves` (ours, §5.2) | Only the owning player (RLS) |

**Our code never hashes, stores, compares, or logs a password.** The player types it, `supabase-js` sends it once over HTTPS to the auth server, and the auth server hashes it (sign-up) or checks it against the stored hash (sign-in). Don't put passwords in our tables, in `raw_user_meta_data`, or in console logs.

Brute-force protection (rate limits on sign-in and sign-up attempts) is enforced by Supabase and tunable under *Authentication → Rate Limits*. A CAPTCHA (hCaptcha or Cloudflare Turnstile) can be switched on later if bots start creating accounts.

#### 3.3.3 Sign-up
```
Game: signUp({ email, password, options: { data: { username }, emailRedirectTo } })
  → Auth server: validates, bcrypt-hashes the password, inserts into auth.users
      → our trigger (§5.1) creates the profiles row with the username
  → Auth server: emails a confirmation link (via your SMTP provider)
  → Game: shows "Check your email to finish creating your account"
Player clicks the link
  → Auth server marks the email confirmed and redirects to the game, signed in
```
With Confirm email off (setup only), `signUp` returns a session immediately and skips the email.

#### 3.3.4 Sign-in and tokens
```
Game: signInWithPassword({ email, password })
  → Auth server: bcrypt-compares against the stored hash
  → returns { access_token, refresh_token, user }
```
- **Access token:** a signed JWT (expires in 1 hour by default). It contains the user id (`sub`) and role `authenticated`. It can't be forged without Supabase's signing key, which never leaves Supabase.
- **Refresh token:** long-lived and single-use. `supabase-js` trades it for a new access token shortly before expiry, and each trade issues a new refresh token (rotation). A reused old refresh token is treated as theft, and Supabase revokes that session.
- **How the database knows who you are:** every request to the Data API carries the publishable key (identifies the *project*) and `Authorization: Bearer <access_token>` (identifies the *player*). Postgres reads the token's `sub` as `auth.uid()`, and that's what the RLS policies in §5 compare against `user_id`.

#### 3.3.5 Session persistence in the browser
- `supabase-js` saves the session in `localStorage` (key `sb-izutqcgxepfpqeffuetn-auth-token`). On page load it restores the session, refreshing the access token if it expired, so players stay signed in across visits and browser restarts.
- `onAuthStateChange` reports `INITIAL_SESSION`, `SIGNED_IN`, `TOKEN_REFRESHED`, `SIGNED_OUT`, `USER_UPDATED`, and `PASSWORD_RECOVERY`. `main.js` listens for these (§6.5).
- **Sign out** calls `signOut()`, which revokes the refresh token on the server and clears it from `localStorage`. It's on the title screen and the pause menu.
- Sessions last until sign-out. Forced session time limits and inactivity timeouts are paid-plan settings (verify current plans). They aren't needed for testers.
- **Each browser has its own session.** Signing in on a second device creates a second session, and the cloud saves are shared through the database (§6).

#### 3.3.6 Password reset
```
Game ("Forgot password?"): resetPasswordForEmail(email, { redirectTo: <game URL> })
  → Auth server emails a single-use reset link (always reports success, so it never reveals whether an account exists)
Player clicks the link
  → Auth server verifies the token and redirects to the game with a short-lived recovery session in the URL
  → supabase-js reads it from the URL, clears it, and fires PASSWORD_RECOVERY
  → Game shows "Choose a new password" → updateUser({ password })
  → Auth server hashes and stores the new password; the player is signed in
```
- **[Default]** Use `supabase-js`'s default *implicit* flow: the recovery session arrives in the URL fragment (`#…`), which browsers never send to any server, and `supabase-js` clears it immediately. The stricter *PKCE* flow (`flowType: "pkce"`) only works if the player opens the email link **in the same browser** that asked for the reset. That's more secure, but it means a support headache when someone's email client opens a different browser. Revisit when there's a custom domain.
- The UI says "If an account exists for that email, we've sent a link," to match the server's non-revealing behavior.

#### 3.3.7 Browser security notes
- **Anything stored in `localStorage` is readable by any script on the same origin.** The session token is therefore only as safe as the code running on the page. Never render player-controlled text with `innerHTML` unescaped. (`title.js` renders slot summaries through `innerHTML` today. Escape anything that comes from the network or another player before usernames and leaderboards appear.)
- **GitHub Pages shares one origin per account.** Every project site under `zachalot.github.io` (this game and any other repo you publish to Pages) shares `https://zachalot.github.io`, and therefore shares `localStorage`. Any of those sites could read this game's session. Either keep untrusted code off your Pages sites, or move the game to a custom domain (§3.6, which also solves email).
- The publishable key in `js/cloud/config.js` is public by design. RLS is what protects data. The `service_role`/secret key must never appear in the repo or the browser.

### 3.6 Email delivery: what "custom SMTP" means
**SMTP** is the protocol mail servers use to hand messages to each other. When Supabase Auth needs to send a confirmation or reset email, it connects to an SMTP server and hands the message over. "Custom SMTP" means giving Supabase the address and login of an email-sending service you choose, instead of Supabase's built-in one. It's a form in the dashboard (*Authentication → SMTP Settings*: host, port, username, password, sender name and address). **There's no code on our side.** Supabase does the sending.

**Why it's needed:** Supabase's built-in sender is meant for trying things out. It's heavily rate-limited and, as far as I know, only delivers to addresses of your Supabase org's team members (verify against current docs). Testers wouldn't receive their emails.

**Your options:**

| Option | What you need | Pros | Cons |
|---|---|---|---|
| **A. Gmail SMTP with an app password** | A personal Gmail account with 2-Step Verification, and an [app password](https://myaccount.google.com/apppasswords). Host `smtp.gmail.com`, port 587. | Free, no domain needed, works today | Emails come from your personal address; a daily sending cap (a few hundred for consumer accounts, verify); Google may throttle mail that looks automated. Fine for a handful of testers. |
| **B. Transactional email service + your own domain** (Resend, Brevo, Postmark, Amazon SES, …) | A domain (roughly $10–20/year) and DNS records the provider gives you | Reliable delivery, a proper sender (`noreply@yourgame.com`), dashboards for bounces | Needs a domain and about 30 minutes of DNS setup |
| ~~Transactional service, sending as your Gmail address~~ | | | Most providers refuse this, and when they don't, Gmail's anti-spoofing policy (DMARC) sends it to spam or rejects it. Not viable. |

**[Default]** Start with **A** for the tester phase, using a personal account (not a work account), and move to **B** when you buy a domain. A domain also lets GitHub Pages serve the game from its own origin, which fixes the shared-`localStorage` issue in §3.3.7, so the two upgrades go together.

**DNS records for option B, in one line each:** *SPF* lists which servers may send mail for your domain. *DKIM* lets the provider sign each email so receivers can verify it wasn't altered. *DMARC* tells receivers what to do with mail that fails those checks. The provider shows you exactly which records to add.

**Other settings once SMTP works:**
- *Authentication → Rate Limits:* raise the emails-per-hour limit to fit your tester count.
- *Authentication → Email Templates:* edit the subject and body of "Confirm signup" and "Reset password." Keep the `{{ .ConfirmationURL }}` placeholder, which is the link.
- Test both emails with a non-team address, and check the spam folder.

### 3.4 Guest (local-only) mode
**[Default]** Keep a "Play without an account" option on the title screen. It uses the same local slots as today, in a `guest` namespace, and never syncs. Existing local saves are therefore never stranded, and offering to move them into an account is M5.

### 3.5 Account settings (dashboard, M1)
- **Email provider:** on. **Minimum password length:** 8. **Confirm email:** on once SMTP is configured (§3.1).
- **Custom SMTP:** configured so reset and confirmation emails reach testers (§3.6, §7 M1).
- **Site URL:** `https://zachalot.github.io/DungeonCrawlerJS/`.
- **Redirect URLs (allow list):** the live URL above, plus `http://localhost:8080/**` for local dev. Password-reset links return to one of these.
- **Anonymous sign-ins:** off for now (§10).

---

## 4. Data Model

```
auth.users              (managed by Supabase: id, email, identities, …)
   │ 1
   ├──── 1  profiles    (id = auth.users.id, username)
   │ 1
   └──── N  saves       (user_id, slot 1..3, version, revision, data jsonb, updated_at)
```

| Table | Purpose | Notes |
|---|---|---|
| `profiles` | Public identity (the username). Created by a trigger on sign-up. | Readable by any signed-in user (for leaderboards later); each user edits only their own row. |
| `saves` | One row per user per slot, holding the whole save blob. | Private: RLS lets a user see and change only their own rows. |

**`saves.revision`** is a counter the server increments on every write. The client sends the revision it last saw, and the write is rejected if it's stale. That's how two devices playing the same slot avoid silently overwriting each other (§6.4). It lives in the table, **not** in the save blob, so exports and `validateSave()` are unaffected.

**Why a `jsonb` blob:** the game is changing fast, and this is the "post-relational" part. Fields that need ranking or querying (level, deepest dungeon, gold) get promoted to real columns later without touching existing saves (§10).

---

## 5. Migration SQL

Stored in the repo under `supabase/migrations/` and applied by pasting each file into the dashboard **SQL Editor** and clicking Run, in order. They're idempotent where practical. When you outgrow this, the Supabase CLI can run the same folder (§10).

### 5.1 `0001_profiles.sql`

```sql
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text,
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[A-Za-z0-9_]{3,20}$')
);

create unique index profiles_username_key on public.profiles (lower(username));

alter table public.profiles enable row level security;

create policy "profiles are readable by signed-in users"
  on public.profiles for select to authenticated using (true);

create policy "users update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Creates the profile row when an account is created (username comes from sign-up metadata).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username)
  values (new.id, nullif(new.raw_user_meta_data ->> 'username', ''));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lets the sign-up form check a name before creating the account.
create function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(p_username));
$$;

grant execute on function public.username_available(text) to anon, authenticated;
grant select, update on public.profiles to authenticated;
```

### 5.2 `0002_saves.sql`

```sql
create table public.saves (
  user_id    uuid     not null references auth.users (id) on delete cascade,
  slot       smallint not null check (slot between 1 and 3),
  version    int      not null,
  revision   int      not null default 1,
  data       jsonb    not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot),
  constraint save_size check (octet_length(data::text) <= 1048576) -- 1 MB, matching SIZE_WARNING_BYTES
);

alter table public.saves enable row level security;

create policy "users read their own saves"
  on public.saves for select to authenticated using (user_id = (select auth.uid()));
create policy "users insert their own saves"
  on public.saves for insert to authenticated with check (user_id = (select auth.uid()));
create policy "users update their own saves"
  on public.saves for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "users delete their own saves"
  on public.saves for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.saves to authenticated;

-- Compare-and-set write. p_base_revision = 0 means "first save of this slot".
-- Raises 'revision_conflict' if the stored revision isn't the one the client last saw.
create function public.save_slot(p_slot smallint, p_version int, p_data jsonb, p_base_revision int)
returns int
language plpgsql security invoker set search_path = '' as $$
declare
  new_revision int;
begin
  if p_base_revision = 0 then
    insert into public.saves (user_id, slot, version, data)
    values ((select auth.uid()), p_slot, p_version, p_data)
    on conflict do nothing
    returning revision into new_revision;
  else
    update public.saves
       set version = p_version, data = p_data, revision = revision + 1, updated_at = now()
     where user_id = (select auth.uid()) and slot = p_slot and revision = p_base_revision
    returning revision into new_revision;
  end if;

  if new_revision is null then
    raise exception 'revision_conflict' using errcode = 'P0001';
  end if;
  return new_revision;
end $$;

revoke execute on function public.save_slot(smallint, int, jsonb, int) from public, anon;
grant  execute on function public.save_slot(smallint, int, jsonb, int) to authenticated;
```

### 5.3 Verifying the migration (M2)
In the SQL Editor, confirm:
1. **Table Editor** shows `profiles` and `saves`, both with the RLS badge on.
2. Create two throwaway accounts (via the game's sign-up once M3 lands, or **Authentication → Users → Add user**). Signed in as A, writing a save works. Signed in as B, `select * from saves` returns **zero** of A's rows, and `save_slot` with A's revision on a nonexistent row raises `revision_conflict`.
3. `select public.username_available('SomeName')` returns `true`, then `false` after that name is taken.

Supabase's **Security Advisor** (Database → Advisors) should report no "RLS disabled" warnings.

---

## 6. Client Architecture

### 6.1 New and changed files

```
js/
  cloud/                    // NEW — the only code that imports supabase-js
    config.js               // SUPABASE_URL, SUPABASE_KEY (publishable). Safe to commit.
    client.js               // createClient(), pinned version loaded as an ES module from a CDN
    auth.js                 // signUp, signIn, signOut, requestPasswordReset, setNewPassword, usernameAvailable, onChange
    cloudSaves.js           // listRemote(), push(slot, blob, baseRevision), delete(slot)  — thin RPC/table wrapper
    sync.js                 // SyncedSaveStore: local cache + reconcile + debounced push (injectable CloudSaves for tests)
  save.js                   // CHANGED — SaveStore gets a per-account key namespace and per-slot sync metadata
  main.js                   // CHANGED — boot waits for the session; saves go through the synced store
  ui/title.js               // CHANGED — signed-out screen (sign in / create account / forgot password / guest), new-password form
  ui/pause.js               // CHANGED — account + sync status line, Sign out
index.html, css/style.css   // CHANGED — auth form styles, sync indicator
supabase/migrations/        // NEW — 0001_profiles.sql, 0002_saves.sql
tests/sync.test.js          // NEW — reconcile matrix against a fake CloudSaves
README.md                   // CHANGED — Supabase setup and how to run locally
```

**No build step is kept.** `client.js` imports `@supabase/supabase-js` from a CDN ES-module URL with an **exact version pinned**. Only `js/cloud/client.js` does this, so `node --test` never touches the network. `sync.js` takes its `CloudSaves` as a constructor argument.

### 6.2 `save.js` — what changes
`SaveStore` stays **synchronous** and becomes the **local cache**. Everything that calls it today (`list()`, `load()`, `save()`, `delete()`, and `title.js`'s render) keeps working untouched. Two changes:

1. **Per-account key namespace.** Keys change from `dungeonCrawler.slot1` to `dungeonCrawler.<owner>.slot1`, where `<owner>` is the user id or `guest`. Without this, a second player on the same browser would load the first player's cache. The constructor takes `{ storage, owner }`; the old unprefixed keys are recognized only by the legacy-import step (M5).
2. **Sync metadata per slot,** stored in a separate key (`…slot1.meta`) as `{ revision, dirty, deleted }`. `revision` is the last server revision this cache matches, `dirty` means local changes haven't been pushed, and `deleted` means a delete hasn't reached the server. Keeping it out of the blob means saves, exports, and `validateSave()` don't change.

`serializeGame`, `restoreGame`, `migrate`, `validateSave`, `exportSave`, and `importSave` are **unchanged.**

### 6.3 `sync.js` — the synced store
Wraps `SaveStore` and `CloudSaves`:

- **`save(slot, game)`:** write locally right away (same as today), set `dirty`, then schedule a push. Pushes are debounced (**[Default]** 5 s) and coalesced, so the 60 s interval and event autosaves don't flood the server. Event saves for death, chest, and grave recovery flush immediately.
- **`pullAll()`:** called when the title screen shows, and after sign-in. Fetches the user's remote rows and reconciles each slot (§6.4). Returns when the local cache is current, so the existing synchronous title render can read it.
- **`flush()`:** pushes anything dirty now. `quitToTitle` awaits it, best-effort.
- **`delete(slot)`:** removes locally, marks `deleted`, and deletes remotely, queued if offline.
- **Offline and errors:** a failed push leaves the slot `dirty` and retries on the next autosave and on the browser's `online` event. The player is never blocked, and the save indicator shows "Saved locally" instead of "Saved."
- **`beforeunload`:** can't reliably finish a network call, so it writes the local cache only. The slot stays `dirty` and syncs on the next visit. That's why the local write comes first.

### 6.4 Reconciliation (per slot, at `pullAll()`)

| Local | Remote | Action |
|---|---|---|
| none | exists | Copy remote into the cache; record its `revision` |
| exists, clean | same revision | Nothing |
| exists, clean | newer revision | Replace the cache with remote |
| exists, **dirty** | same revision as the cache's base | Push local (compare-and-set) |
| exists, **dirty** | **newer** revision | **Conflict** — ask the player: keep this device's save or load the cloud save |
| exists (never synced) | none | Push as a first save (`p_base_revision = 0`) |
| `deleted` | exists | Delete remotely, then clear the marker |

A push that raises `revision_conflict` becomes the same conflict prompt. The loser isn't discarded silently: **[Default]** the losing copy is offered as an export code before it's overwritten.

### 6.5 `main.js` — what changes
- Boot: `await auth.init()` (restores the session), then build the store for that owner, then `showTitle()`.
- `new SaveStore()` becomes the synced store. The `saveNow()` callers in `main.js` (60 s interval, `beforeunload`, game events, pause-menu "Save now", quit) don't change, because `store.save(slot, game)` keeps its signature.
- `showTitle()` calls `await store.pullAll()` before rendering the slots.
- `quitToTitle()` awaits `store.flush()`.
- Auth state changes (sign-in, sign-out, token expiry) re-run store creation for the new owner and return to the title screen. Signing out mid-game saves and flushes first.

### 6.6 `title.js` — what changes
- New **signed-out** view: Sign in / Create account tabs (email + password; sign-up adds a username), a **Forgot password?** link, and **Play without an account**.
- New **password recovery** view, shown when the player arrives from a reset email link (the auth client reports a `PASSWORD_RECOVERY` event): a "Choose a new password" form.
- Signed-in view is today's three slot cards plus the username and a Sign out button. The "Saves live in this browser only" line becomes "Signed in as <name> · saves sync to your account," or the old text in guest mode.
- **Import** and the slot actions are unchanged. They call the same `store` methods.

---

## 7. Milestones

| # | Milestone | Done when |
|---|---|---|
| M1 | Supabase project setup | Project URL and publishable key noted; Email provider on, min password 8; Site URL and localhost redirects set; custom SMTP configured and a test reset email reaches a non-team address. *No code.* |
| M2 | Schema + RLS | `0001` and `0002` applied; both tables show RLS on; the two-account isolation check in §5.3 passes; Security Advisor is clean; migrations committed under `supabase/migrations/` |
| M3 | Accounts | Create an account (email + password + username), sign in, sign out; usernames are unique; "Forgot password?" emails a link that returns to the game and sets a new password; the session survives a refresh; guest mode still plays |
| M4 | Cloud saves | `SaveStore` namespaced by owner; `SyncedSaveStore` pushes on autosave and pulls on title; a save made in one browser appears in another; the save indicator shows synced vs local-only |
| M5 | Conflicts, offline, legacy import | Stale-revision writes raise the keep-mine/keep-cloud prompt (with export of the loser); offline play queues and syncs later; deletes sync; a first sign-in offers to import old `dungeonCrawler.slotN` saves into the account |
| M6 | Hardening + docs | `tests/sync.test.js` covers the §6.4 matrix; `node --test` green; README setup written; main design doc §1.2/§13/§14 updated; a backup routine decided (§9) |

### M1 — step by step (dashboard; ~20 minutes)
1. **Keys:** *Project Settings → API*. Copy the **Project URL** (`https://izutqcgxepfpqeffuetn.supabase.co`) and the **publishable** (or legacy `anon`) key. Do not copy the secret / `service_role` key anywhere.
2. **Authentication → Sign In / Providers:** Email on, minimum password length 8. Leave **Confirm email** off until step 4 works, then turn it on.
3. **Authentication → URL Configuration:** set the Site URL and redirect allow list per §3.5.
4. **Email delivery (custom SMTP):**
   - Pick option A or B from §3.6. For A: turn on 2-Step Verification on a personal Gmail account and create an app password. For B: add the provider's DNS records to your domain and wait for it to show as verified.
   - *Authentication → SMTP Settings:* enable custom SMTP and enter the host, port, username, password, and sender address. The SMTP password stays in Supabase only, never in the repo.
   - Check *Authentication → Rate Limits* and *Email Templates* (the reset template's link must keep Supabase's confirmation URL placeholder).
   - Test: create a user with a non-team email, trigger a reset from the dashboard (*Users → ⋯ → Send password recovery*), and confirm the email arrives.
   - Then turn **Confirm email** on.

---

## 8. Testing

- **Unit (`node --test`):** `tests/sync.test.js` drives `SyncedSaveStore` with a fake `CloudSaves` (in-memory, with revisions) through every row of §6.4: first sync, clean pull, dirty push, conflict, offline queue, delete. The existing `tests/save.test.js` keeps passing with the namespaced `SaveStore`.
- **Database:** the §5.3 isolation checks, rerun after any policy change.
- **Manual (two browsers):** play in A, quit, and Continue in B; play offline and reconnect; sign out and in as a different user and confirm no cross-account cache; refresh while signed in; expired-session behavior.
- **Browser verification** uses the existing `.claude/launch.json` dev server on `:8080`.

---

## 9. Risks and Decisions

| Risk | Mitigation |
|---|---|
| **Cheating:** the client writes its own save, so levels and gold are forgeable. | Acceptable for testers. Before leaderboards matter, move leaderboard-relevant writes behind server-side checks (§10). |
| **Reset emails don't arrive** (default sender limits, or an unverified SMTP domain) | Custom SMTP in M1, with the test in M1's checklist. Keep Confirm email on so mistyped addresses are caught at sign-up. |
| **Free project pauses when idle** | The local cache keeps the game playable; check the dashboard before a play session, or move to the paid plan once testers depend on it. |
| **Data loss** | The free plan doesn't include managed backups (verify current terms). Export is a player-side backup, and a scheduled `pg_dump` or dashboard export covers the database. Decide in M6. |
| **Wrong save on conflict** | Compare-and-set `revision` plus the export-the-loser step (§6.4), instead of silent last-write-wins. |
| **Key exposure** | Only the public URL and publishable key are in the repo. RLS is the access control, and §5.3 tests it. Never ship the secret key. |
| **CDN dependency** | The supabase-js version is pinned; vendor it into `js/vendor/` if the CDN ever becomes a concern. |
| **Large saves** | The 1 MB check constraint matches the existing client warning. See §9.1 for how this scales to an endless world. |

### 9.1 Will the save get too big for an endless world?

**No world-size cap is needed, but the single blob stops being the right shape eventually.** The world is regenerated from the seed, so only what the player *changed* is saved:

| Part of the save | Size | Grows with |
|---|---|---|
| Player, inventory, stash, grave | a few KB | Nothing (bounded by slot counts) |
| `dungeons` (cleared/chest state) | ~100 B each | Dungeons visited |
| `explored` (fog of war) | ~170 B per chunk (~29 KB for the full 400 × 400 world) | Area explored; ~6,000 chunks (about 2,400 × 2,400 tiles) reaches 1 MB |
| Player-made changes (built villages, placed structures) | Unbounded | What players build |

Where it hurts first, in order:
1. **`localStorage`** (~5 MB per site, shared by all slots) fills before Postgres does. The cache can move to IndexedDB when needed.
2. **Pushing the whole blob every few seconds** gets wasteful at multi-MB sizes (bandwidth, and Postgres rewrites the whole value).
3. **The 1 MB check constraint** in `0002_saves.sql` becomes a hard failure rather than a warning, so raise it deliberately, not by accident.

The plan, to build when the numbers justify it and not before:
- **Keep the blob small and bounded:** player, inventory, stash, grave, and the other small maps.
- **Move unbounded world deltas into sparse rows keyed by region,** e.g. `world_regions(user_id, slot, rx, ry, data jsonb, revision)`, loaded lazily as the player approaches, exactly like chunks already are. Only changed regions are pushed.
- **Compress `explored`** (run-length or deflate) first; it's a cheap win, and it needs only a save-version bump and a migration.
- **Player-built villages** are shared, queryable data, so they get proper tables (§10) from the start, not region blobs.

The sync layer already tracks `revision` per slot, so per-region revisions follow the same pattern.

---

## 10. Future (backlog)

- **Leaderboards:** promote `level`, `play_time`, and deepest dungeon to real columns on `saves` (or a `leaderboard` view), index them, and read top-N with plain SQL. For trust, a database function or Edge Function validates a score before it's accepted.
- **Anonymous guest accounts:** Supabase anonymous sign-in gives every visitor a real account with zero friction, upgradeable to email + password or Google later (identity linking), replacing the local-only guest mode.
- **Villages, crafting, shared world:** relational tables (`villages`, `village_members`, `recipes`, …) with their own RLS. Player-built villages are shared data, which is exactly what Postgres is good at.
- **Multiplayer:** Supabase Realtime (presence/broadcast) for light co-op. Action multiplayer will want an authoritative game server (e.g. Cloudflare Durable Objects or Node) with Postgres behind it for persistence.
- **Migrations tooling:** adopt the Supabase CLI to apply `supabase/migrations/` from the command line and CI, and a separate staging project once testers shouldn't share the dev database.
- **Google sign-in (OIDC):** turn on the Google provider with a Google Cloud OAuth client (consent screen, Web client, redirect URI `https://izutqcgxepfpqeffuetn.supabase.co/auth/v1/callback`), add a "Continue with Google" button, and a one-time "choose a username" prompt for accounts without one. No schema change.
- **Splitting world data out of the blob** (§9.1).

---

## 11. Open Questions

1. **Email sending.** Gmail app password for now **[Default]**, or buy a domain and use a transactional provider from the start (§3.6)?
2. **Guest mode.** Keep local-only play **[Default]**, or require an account for everything?
3. **Conflict behavior.** Prompt with keep-mine / keep-cloud **[Default]**, or newest save always wins?
4. **Push timing.** Is a 5 s debounce with immediate flush on death, chest, and grave events **[Default]** acceptable?
5. **Where the Supabase config lives.** Committed `js/cloud/config.js` **[Default]**, since the values are public by design.
6. **Reset flow.** Implicit flow **[Default]** (works from any browser), or PKCE (stricter, same-browser only) (§3.3.6)?
7. **Custom domain.** Buy one to fix the shared `zachalot.github.io` origin (§3.3.7) and enable proper email, now or later?
