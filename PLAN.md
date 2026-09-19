# PLAN.md — Task breakdown and ownership

> ## STATUS — read this before anything else
>
> **The core loop is DONE and works.** Four screens, two tables, five reducers,
> the race proven both at the CLI and through the UI on two identities. 24
> client tests green, typecheck and production build clean.
>
> **A known-good fallback exists: the `demo-v1` branch.** It points at the last
> verified-working commit before the Phase 5 schema work. If Phase 5 goes wrong,
> `git checkout demo-v1` is the way back. **Do not delete or force-push it.**
> (It is a branch rather than a tag because annotated tag pushes fail through
> the web sandbox's proxy. Either of us can add a real tag from a laptop.)
>
> **Roughly 22 hours left. Not tight — Phase 5 fits comfortably.** Sketch:
>
> | Window | Work |
> |---|---|
> | next ~6h | Phase 5: E's schema pass, V's stress test and scoped subscriptions |
> | +6 → +10 | V's drawings, the contention ticker, integration |
> | +10 → +14 | Re-test everything, two-laptop rehearsal |
> | +14 → +18 | Devpost writeup, screenshots, submit |
> | +18 → +22 | Buffer and more rehearsal |
>
> **Nothing is submitted yet.** Not urgent at this range, but a Devpost entry
> can be edited until the deadline, so putting a stub up costs nothing and
> removes the one failure mode that cannot be recovered from: having a working
> build and no submission because the last two hours went to debugging. Do it
> whenever convenient, not necessarily first.
>
> Phase 5 plans, ownership and both per-person briefs live in `PROMPTS.md`.

Companion to `CLAUDE.md` (which holds the idea, scope and data model).
This file holds **who does what, in what order, and what blocks what**.

Hours are measured from hack start. Phase 0 should be done *before* the clock
starts if the rules allow it.

Owners: **E** = Ella, **V** = Vanessa, **E+V** = both, together.

---

## Why the work is not split cleanly backend/frontend

The backend is roughly 150 lines — two tables, five reducers. It will be finished
around hour 8. The frontend is 20+ hours of work. A hard backend/frontend wall
leaves E idle for two thirds of the event.

So: E owns the backend **and then joins the frontend**. The split below is
sequenced around that, and around one hard rule — *freeze the schema early and
generate bindings immediately*, so V can build against real types long before the
reducers actually do anything.

---

## Phase 0 — Both machines can build and publish (BLOCKING)

Nothing else starts until both laptops pass this. If only one person can publish
a module, the other cannot test her own work and the team has a bus factor of 1.

- [ ] **E+V** Confirm HopHacks' rules on pre-event setup. Installing tooling and
      doing tutorials is near-universally allowed; pre-written project code is not.
- [ ] **E+V** Install Rust toolchain (`rustup`) on both machines
- [ ] **E+V** Install the `spacetime` CLI on both machines
- [ ] **E+V** Verify the WASM target exists: `rustup target list --installed | grep wasm`.
      If missing: `rustup target add wasm32-unknown-unknown`. The CLI may do this
      for you — check before assuming it is broken.
- [ ] **E+V** Run the official quickstart end to end on **each** machine: local
      server running, module published, client receiving one live update
- [ ] **E+V** Delete the quickstart project
- [ ] **E+V** Skim `spacetime --help` and the subcommand help. The CLI is the
      ground truth for command syntax, not this file and not an AI assistant's
      memory.

### Verify your install right now

```bash
spacetime --version        # CLI present?
spacetime start            # local server boots? (leave running in its own terminal)
rustc --version            # Rust present?
rustup target list --installed | grep wasm    # WASM target present?
```

If `spacetime start` boots and holds, you are in good shape.

**Phase 0 exit criteria:** both laptops have published a module and seen a live
update land in a client. Do not proceed on one person's machine alone.

---

## Setup gotchas we already hit (read before running `spacetime init`)

### Install Rust BEFORE `spacetime init`

If cargo is missing when you scaffold, the template warns and skips cargo setup.
Order: install rustup → `. "$HOME/.cargo/env"` → `rustup target add
wasm32-unknown-unknown` → then `spacetime init`.

After installing rustup, cargo is not on the PATH of shells that are already
open. Either run `. "$HOME/.cargo/env"` in each one, or open a new tab.

### The init wizard wants values, not shell commands

`spacetime init` prompts interactively even when you pass a path argument.
Answer with plain values:

| Prompt | Answer |
|---|---|
| Project path | `server` |
| Database name | `food-pickup` |
| Server language | `rust` |

Typing `cd server` at the path prompt creates a directory literally named
`cd server`, with a space in it. If that happens: `rm -rf "cd server"` (quotes
required) and re-run.

### The WASM target is required

SpacetimeDB modules compile to WebAssembly:

```bash
rustup target add wasm32-unknown-unknown
rustup target list --installed | grep wasm    # verify
```

### First `cargo check` is slow

It downloads and compiles every dependency. Minutes, not seconds. It is not hung.

---

## Where we deploy: Maincloud, not local

**The module lives on SpacetimeDB Maincloud. Database name: `food-pickup`.**

Reason: the entire demo is two laptops hitting the same module instance at the
same moment. Against a local `spacetime start`, Vanessa's laptop has to reach
Ella's machine over hackathon wifi — LAN IPs, firewalls, and client isolation
that is often enabled on conference networks. That is a terrible thing to debug
at hour 30.

Maincloud removes all of it: both clients connect to a hosted module, no network
configuration at all.

**Do this in Phase 1, not later:** publish to Maincloud and confirm Vanessa's
laptop can connect. Proving the two-device path works is cheap on hour 2 and
expensive on hour 30.

Local `spacetime start` is still fine for fast iteration while writing reducers.
Just make sure the demo path is the Maincloud one, and rehearse on it.

---

## Phase 5 schema pass (E) — done, needs deploying

Two tables became four. `post_listing`'s signature is **unchanged**, so V's
client is not broken by this — the only client-visible additions are new things
to subscribe to.

| Table | Kind | Why |
|---|---|---|
| `user` | public | display names |
| `listing` | public, `completed` indexed | the board |
| `claim_attempt` | public **event** | every claim attempt, won or lost |
| `expiry_tick` | scheduled, private | drives `expire_listings` |

Plus a `my_pickups` view, and a max-3-open-claims invariant enforced inside
`claim_listing`.

### Deploying

```bash
cd server
spacetime publish food-pickup --yes
spacetime call food-pickup arm_expiry     # init does not re-run on a live DB
spacetime call food-pickup seed_board     # only if the board is empty
spacetime generate --lang typescript --out-dir ../client/src/module_bindings
```

### Three things that turned out not to work as planned

**1. Row-level security is not implemented in 2.10.1. The `pickup_contact`
table was cut.** `#[client_visibility_filter]` is behind the crate's `unstable`
feature and carries `// TODO: RLS filters are currently unimplemented, and are
not enforced.` It compiles, publishes, and does nothing. Shipping it would have
meant claiming row-level security in the pitch while every client still received
every contact row. **Do not describe Relay as having row-level security.** If a
judge asks what we would add next, this is a good honest answer.

**2. An `Option` column cannot be an index-filter argument.** `claimed_by` is
the natural index for "my pickups", but `.claimed_by().filter(Some(who))` does
not compile. Combined with the fact that a `#[view]` may only start from an
index and cannot call `iter()`, `my_pickups` starts from the `completed` index
and narrows to `ctx.sender()` in Rust. That is why the index is on `completed`
and not where you would expect.

**3. `.update()` lives on the primary key, not on any index.**
`.claimed_by().update(...)` does not exist; it is `.id().update(...)`.

### Open question — verify before relying on it

`claim_listing` writes a `claim_attempt` row on **both** paths, won and lost.
But a reducer returning `Err` aborts its transaction, and that insert is inside
the transaction — **the losing row may roll back**, leaving a ticker that only
ever shows winners.

Nobody has checked yet. Thirty seconds to settle it:

```bash
spacetime subscribe food-pickup "SELECT * FROM claim_attempt" --num-updates 5 &
spacetime call -- food-pickup claim_listing 30 & spacetime call -- food-pickup claim_listing 30 & wait
```

Two rows printed → losses survive, the ticker works as designed. One row → they
roll back, and the fix is a **design change, not a patch**: the loser's outcome
would have to travel in an `Ok` result instead of an `Err`, which costs us the
rejection toast. That trade is V's call as much as E's, since the toast is hers.

---

## Phase 5 item 1 — scheduled expiry (E, done, needs deploying)

The database calls our code on a timer with no client involved. A second
technical claim alongside the race, and one most teams will never touch.

**What it does:** every 30 seconds, `expire_listings` deletes listings whose
pickup window has passed **and that nobody claimed**. Claimed listings are left
alone — a volunteer may be en route past the posted window, and deleting it out
from under them would be wrong. An unclaimed listing past its window is food
nobody came for.

### Deploying it — `init` will NOT fire

`#[spacetimedb::reducer(init)]` runs only on a *fresh* database. `food-pickup`
already exists, so republishing leaves the ticker unarmed and nothing expires.
Arm it once by hand:

```bash
cd server
spacetime publish food-pickup --yes
spacetime call food-pickup arm_expiry        # <- REQUIRED, or nothing happens
spacetime logs food-pickup -f                # expect: expiry ticker armed, every 30s
```

`arm_expiry` is idempotent — calling it twice will not schedule two tickers.
The alternative is `--delete-data=always`, which wipes the 15 seeded listings;
arming by hand avoids that.

### Demoing it

The post form's shortest window is an hour, so trigger it from the CLI with a
90-second window and let it expire on camera:

```bash
PICKUP=$(( ($(date +%s) + 90) * 1000000 ))
spacetime call -- food-pickup post_listing '"Expiry Demo"' '"watch this vanish"' \
  "{\"__timestamp_micros_since_unix_epoch__\": $PICKUP}" '39.2904' '-76.6122'
```

> "Nobody touch anything." Within 30 seconds of the window passing, the pin
> disappears from both laptops at once. No client asked for that.

Have `spacetime logs -f` on screen — it prints `expired listing=N` as it happens,
which is the proof that the database did it rather than a client.

### What V still owns

Nothing is required — expiry works today. If V wants an expiry treatment in the
UI (a fade, a "gone" flash), that is hers; the row simply vanishes from the
subscription, so a plain delete already renders correctly.

---

## Where to run `spacetime` commands

Some commands care about your working directory and some do not. The split is
whether the command *reads files* or *talks to the running server*.

Use **two terminals**: one running the server, one in the repo for everything else.

### Terminal 1 — the server (run from anywhere)

```bash
spacetime start     # leave this running all weekend
```

This is a daemon. It does not care where you launch it from, and its data lives
in SpacetimeDB's own directory, **not** in the repo. Nothing it creates should
ever be committed.

### Terminal 2 — in the repo (these are path-sensitive)

**The rule: `spacetime` commands run from `server/`. `cargo` commands run from
`server/spacetimedb/`.**

`server/spacetime.json` is the project config —
`{"server": "maincloud", "module-path": "./spacetimedb"}` — so the CLI, run from
`server/`, already knows where the Cargo project is. Only `cargo` itself needs
the deeper directory.

```bash
cd ~/path/to/ella-vanessa-hophacks/server

spacetime publish food-pickup --yes
spacetime generate --lang typescript --out-dir ../client/src/module_bindings
```

```bash
cd ~/path/to/ella-vanessa-hophacks/server/spacetimedb

cargo check      # cargo needs Cargo.toml, which lives HERE
```

### Why `../client/...` and not `../../client/...`

`server/` is the **spacetime project root** — it holds `spacetime.json`.
`server/spacetimedb/` is only the **Cargo crate**, named by that file's
`module-path`. The CLI is run from the project root, where it reads
`spacetime.json` and finds the crate itself. You never `cd` into
`server/spacetimedb/` to run `spacetime`; you only go there for `cargo`.

So from `server/`, one `..` reaches the repo root and
`../client/src/module_bindings` is correct. `../../client/...` would climb above
the repo entirely.

Verify empirically after the first generate — this is a thirty-second check that
settles any doubt:

```bash
ls ../client/src/module_bindings     # expect generated .ts files
find .. -name module_bindings -type d   # expect exactly ONE hit, under client/
```

If a stray `server/client/` ever appears, delete it and re-run from `server/`.

Getting `--out-dir` wrong fails silently — it writes bindings to a real but
wrong directory and V never sees them. From `server/` it is
`../client/src/module_bindings`.

### Anywhere — these talk to the server by module name

```bash
spacetime call <module-name> claim_listing 1
spacetime sql  <module-name> "SELECT * FROM listing"
spacetime logs <module-name>
```

These address the module by name over the network, so your working directory is
irrelevant. Run them from wherever is convenient.

> Verify exact flags with `spacetime <subcommand> --help`. The CLI is ground
> truth; this table is a memory aid.

### What must never be committed

Building the module creates `server/target/` — hundreds of megabytes of Rust
build artifacts. `.gitignore` already excludes it, along with `node_modules/`.
Do not remove those lines. If `git status` ever shows thousands of files, stop
and check `.gitignore` before committing anything.

The one generated thing you **do** commit is `client/src/module_bindings/`, so
Vanessa gets typed bindings without building the Rust module.

---

## Resolved: toolchain facts (confirmed, stop re-deriving these)

| Fact | Value |
|---|---|
| `spacetime` CLI (E) | **2.10.1** |
| `spacetimedb` npm SDK (V) | **2.10.1** |
| Versions match? | **Yes — verified.** Bindings will line up. |
| Database name | `food-pickup` |
| Deploy target | Maincloud |
| Rust module location | **`server/spacetimedb/`** — not `server/` |

The CLI and SDK majors must stay matched: `spacetime generate` emits imports
whose package name and API shape follow the CLI that produced them. If either
side upgrades, re-check both and regenerate.

### The module is NOT at `server/`

`spacetime init --lang rust server` creates a wrapper at `server/` and puts the
actual Cargo project one level down, under `server/spacetimedb/`. Running
`cargo check` at `server/` fails with "could not find `Cargo.toml`". That is the
wrong directory, not a broken install.

```bash
find server -name Cargo.toml    # if ever unsure
```

### The template ships first-party agent instructions — use them

`spacetime init` drops the same 20KB of guidance into `server/` three times, once
per AI tool: `CLAUDE.md`, `AGENTS.md`, `.windsurfrules`.

**Do not delete these.** They are Clockwork's own version-matched instructions,
and they outrank this repo's root `CLAUDE.md` on every question of SpacetimeDB
API syntax. Our root brief was written partly from memory and its Rust snippets
are explicitly shape-not-gospel; the template's file is ground truth for 2.10.1.

Claude Code loads nested `CLAUDE.md` files for work in their subtree, so a
session working in `server/` picks this up automatically. Read it before writing
reducers. **Where it disagrees with our root `CLAUDE.md`, the template wins** —
and fix the root file so the two sessions stay in sync.

---

## Phase 1 — Schema freeze and bindings (E+V together, ~hours 0–2)

This is the most important 2 hours of the event. Do it side by side, not split.

- [x] **E+V** Agree the final schema from `CLAUDE.md`. Argue about it now, not later.
- [x] **E** `spacetime init` a Rust module in `server/` — DONE
- [x] **E** Write the two table definitions (`listing`, `user`) — copy exact macro
      syntax from the current quickstart, not from `CLAUDE.md`
- [x] **E** ~~Write all five reducers as **empty stubs**~~ — skipped the stub step and
      shipped working reducers in one pass (`0bc5cbf`). Worked out, but it is why V
      waited longer than this plan intended.
- [x] **E** `spacetime publish` — live on Maincloud as `food-pickup`
- [x] **E** From `server/`: `spacetime generate --lang typescript --out-dir ../client/src/module_bindings`
- [x] **E** Commit the generated bindings (`f761e6a`)
- [x] **V** In parallel: scaffold `client/` — Vite + React + TypeScript
- [x] **V** Install deps: SpacetimeDB TS SDK, `leaflet`, `react-leaflet`
- [x] **V** Import Leaflet's CSS and render a bare map centered on Baltimore.
      *If the map is a grey box, the CSS import is missing.*

**Phase 1 exit criteria:** `client/src/module_bindings` exists and is committed;
V can import typed `Listing` and `User` and get autocomplete. The reducers do
nothing yet and that is fine — V is unblocked.

### Schema freeze rule

After Phase 1, the schema is **frozen**. If it genuinely must change:
E makes the change, republishes, regenerates bindings, commits, and **tells V
immediately in person**. A silent schema change is how you lose four hours at
hour 25.

---

## Phase 1 COMPLETE — the binding surface

Module published to Maincloud as `food-pickup`; bindings generated by CLI 2.10.1
into `client/src/module_bindings/` and committed.

**Rust snake_case becomes TypeScript camelCase.** The row fields are:

```ts
Listing { id, donor, description, pickupBy, lat, lng,
          postedBy, claimedBy /* Identity | undefined */, completed }
User    { identity, name }
```

`pickup_by` → `pickupBy`, `posted_by` → `postedBy`, `claimed_by` → `claimedBy`.
Using the Rust spelling in the client is a silent `undefined`, not a type error,
in any spot that isn't fully typed.

Exports from `module_bindings/index.ts`:

- `tables` — query builder; table accessors are `tables.listing`, `tables.user`
- `reducers` — the five reducers, built via `convertToAccessorMap`
- `DbConnection`, `SubscriptionBuilder`, and the `*Context` types
- `types/reducers.ts` — `ClaimListingParams`, `PostListingParams`, etc.

The reducers register under snake_case names (`"claim_listing"`) and are then run
through `convertToAccessorMap`. **V: confirm the accessor casing from
autocomplete** — `reducers.claimListing` vs `reducers.claim_listing` — rather
than trusting either of our guesses. It is a one-second check in the editor and
neither session can verify it without the package installed.

### Reducers now return `Result<(), String>` — failures are legible

All five reducers return an error message instead of silently no-oping. The
client receives these through the reducer event context.

**These strings are demo copy.** They are shown to judges and read aloud, so
they are written for a person, not a developer. Agreed wording:

| Situation | Message |
|---|---|
| Lost the race | `Vanessa claimed this first.` (falls back to `Someone else claimed this first.` if that volunteer never set a name) |
| Already delivered | `That pickup has already been delivered.` |
| Listing gone | `That listing is no longer available.` |
| Not your claim | `You don't hold this claim.` |
| Bad coordinates | `That location isn't valid — pick a point on the map.` |
| Empty / too long | `Donor name can't be empty.` · `Description has to be 280 characters or fewer.` |

`claim_listing` looks the winner's name up in the `user` table rather than
saying "someone else". **Naming the winner is the point** — "Vanessa claimed
this first" makes the contention concrete in a way a generic message does not,
and it costs one table lookup.

Change these in `server/spacetimedb/src/lib.rs` if the wording should differ, but
agree on it **before** the demo, not during.

**This is a demo upgrade, not just error handling.** Previously the loser of a
contested claim just watched the row grey out, which is ambiguous — it looks
identical to a UI glitch. Now the loser gets a message naming what happened.
Surface it as a toast on the claim button: that is the moment the judges are
being asked to understand, and it should be explicit.

Returning `Err` also aborts the transaction, so a losing claimant writes nothing.

`post_listing` validates before inserting: non-empty trimmed strings within
length caps, and finite coordinates inside real lat/lng ranges. V flagged that a
NaN coordinate would break every client's map, since everyone subscribes to
every row — that is now rejected at the reducer. Client-side filtering is still
worth keeping as defense in depth, but no bad row can be stored in the first
place.

**Still render from the subscription, never optimistically.** The `Result` tells
you a call failed; the row is still the only source of truth for what the board
looks like.

**An open listing has `claimedBy` absent/undefined, not `null`.** Test with
`claimedBy === undefined` or a falsy check, not `=== null`.

---

## Calling reducers from the CLI: the Timestamp argument

`spacetime call` does **not** accept a bare integer for a `Timestamp`. The
reducer signature reports it as a wrapped type:

```
post_listing(donor: String, description: String,
             pickup_by: { __timestamp_micros_since_unix_epoch__: i64 },
             lat: f64, lng: f64)
```

Passing `0` fails with ``invalid type: integer `0`, expected a 1-element tuple``.
The working form is:

```bash
spacetime call food-pickup post_listing \
  '"Pratt Street Bakehouse"' \
  '"About 20 day-old bagels"' \
  '{"__timestamp_micros_since_unix_epoch__": 1790000000000000}' \
  '39.2857' '-76.6100'
```

### `spacetime sql` is a restricted dialect — no `IS NULL`

`WHERE claimed_by IS NULL` fails with `Unsupported expression: claimed_by IS NULL`.
Option columns cannot be tested that way. Select the column and read it instead —
`None` prints as `(none = ())`:

```bash
spacetime sql food-pickup "SELECT id, donor, claimed_by FROM listing"
```

Assume any SQL beyond simple `SELECT ... WHERE <column> = <value>` may be
unsupported, and check rather than guess. This is CLI-side only — the client
never writes SQL at all in 2.x, it uses the query builder.

### Negative numbers need `--`

Baltimore longitudes are negative. Without a `--` separator the CLI parses
`-76.6100` as short flags and fails with ``unexpected argument '-7' found``:

```bash
spacetime call -- food-pickup post_listing '"Donor"' '"desc"' \
  '{"__timestamp_micros_since_unix_epoch__": 1790000000000000}' \
  '39.2857' '-76.6100'
```

`server/seed.sh` handles both this and the Timestamp wrapping. Run it from
`server/`.

---

## Phase 2 — Parallel build (hours 2–10)

### E — backend

- [x] `set_name` — upsert `user` row for `ctx.sender`
- [x] `post_listing` — insert with `posted_by = ctx.sender`, `claimed_by = None`
- [x] `claim_listing` — **conditional**: only write if `claimed_by` is `None`.
      This is the centerpiece. Do not simplify it into an unconditional write.
- [x] `unclaim_listing` — only if `claimed_by == ctx.sender`
- [x] `complete_listing` — only if `claimed_by == ctx.sender`
- [x] *Beyond the list:* all five validate input and return `Result<(), String>`;
      the error strings are demo copy (see the agreed wording above)
- [x] Test every reducer from the CLI — all five exercised directly.
- [~] *(superseded)* Earlier partial note: `post_listing` is covered
      (the seed run, plus the `999 999` rejection confirming validation is
      deployed). `set_name`, `claim_listing`, `unclaim_listing` and
      `complete_listing` have only been exercised through the UI.
- [x] **Prove the race.** Done — transcript recorded below.
- [x] Write a seed script — `server/seed.sh`, 15 Baltimore listings, run and
      verified in `spacetime sql`
- [x] Learn `spacetime logs` for debugging — note that the module logs nothing
      unless it calls `log::info!`. `claim_listing` now logs both outcomes; an
      empty log stream elsewhere is expected, not broken.

### V — frontend

- [x] Connect to the module via `SpacetimeDBProvider`; read rows with
      `useTable(tables.listing)` and `useTable(tables.user)` (2.x has no SQL
      strings client-side — see `CLAUDE.md` under Client architecture)
- [x] Render listings as map markers, driven **only** by the subscription
- [x] Name-entry screen on first load (calls `set_name`)
- [x] Listing detail panel with a Claim button — verified live, two identities
- [x] Open vs. claimed visual states — verified: a claim in one browser greys the
      pin in the other with no refresh
- [x] Basic layout and styling
- [x] *Beyond the list:* race-error toast, so the losing claimant sees why

**V's hard rule:** no `fetch`, no polling, no React Query, no Zustand. Rows change,
the subscription fires, React re-renders. If you are writing data-fetching code,
stop and re-read the client SDK docs — you have misunderstood the database.

### Milestone reached

**The two-laptop simultaneous-claim test passed.** Two browsers, one Maincloud
module, both tapped the same listing; one won, the other got the rejection
message. That is the project's central claim, demonstrated end to end.

### Race proof — CLI transcript (demo evidence)

Two `claim_listing` calls launched from one shell line, so both are in flight
before either returns:

```
$ spacetime call -- food-pickup claim_listing 30 & \
  spacetime call -- food-pickup claim_listing 30 & wait
[1] 60949
[2] 60950
WARNING: This command is UNSTABLE...WARNING: This command is UNSTABLE...

[1]  - done       spacetime call -- food-pickup claim_listing 30
Error: Response text: Ella CLI claimed this first.
[2]  + exit 1     spacetime call -- food-pickup claim_listing 30
```

What makes this concurrent rather than sequential: both PIDs are assigned before
either process exits, and the two warning lines interleave on one line. One
process exits 0, the other exits 1.

**It must be one shell line.** Running the two calls as separate commands lets
the first finish before the second starts, which only tests the guard, not
contention.

Row state afterward confirms a single holder:

```
 id | claimed_by
----+------------------------------------------------------------
 30 | (some = (__identity__ = 0xc200af83...))
```

Also note the message names the winner — `claim_listing` looked up the `user`
row, the same path that prints a teammate's name in the live demo.

### Live contention log — a second demo surface

`claim_listing` logs both branches, so `spacetime logs food-pickup -f` in a
terminal shows the database resolving contention as it happens:

```
claim ACCEPTED  listing=30  holder=Identity(0xc200af83...)
claim REJECTED  listing=30  already held by Ella CLI
```

Worth having open on screen during the pitch. The UI shows a judge *that* one
claim won; the log shows them *both requests arriving and the server deciding*.
That is a stronger demonstration of the serialized-transaction argument than the
toast alone, and it costs nothing to leave running.

Nothing else in the module logs. That is deliberate — instrumentation is cheap
but not free, and this is the one place it earns its keep.

### Guard proof — authorization rejects

```
$ spacetime call -- food-pickup unclaim_listing 29     # succeeds, claimed_by -> None
$ spacetime call -- food-pickup complete_listing 29
Error: Response text: You don't hold this claim.
```

`complete_listing` refuses because `claimed_by != Some(ctx.sender())`. Same check
rejects completing a listing held by someone else — worth demonstrating that way
too, with V holding the claim in her browser.

---

## Phase 3 — E joins the frontend (hours 10–20)

Backend is done. Do not go looking for more backend work.

- [ ] **E** Post-listing form (donor, description, pickup-by, location picker)
- [ ] **E** "My pickups" view — claimed-by-me listings, with unclaim and complete
- [x] **V** Map polish: popups (JSX children — escaped; never `bindPopup`) and a
      relative pickup window with urgency colour. Clustering not needed at 15 pins.
- [x] **V** Empty, loading and connection-lost states — all three in
      `ConnectionGate.tsx`, extracted from `App.tsx` so E owns that file now
- [ ] **E+V** Run the seed script and look at a full board for the first time

### V's Phase 3 verification (done)

`npm test` — 24 vitest cases over the pure logic. Run it before any push that
touches `listing.ts` or `pickupWindow.ts`.

**XSS proof.** Popups are the first place free-form listing text reaches the
DOM, and anyone can call `post_listing`. Rendered a listing whose donor and
description carried injection payloads in a real browser:

```
donor:       <img src=x onerror="window.__XSS_DONOR=1">
description: <script>window.__XSS_DESC=1</script><b>bold?</b>

xssDonorFired: false    injectedImg:    false
xssDescFired:  false    injectedScript: false
                        injectedBold:   false
both rendered as literal text
```

`<Popup>` with JSX children is what makes that true. `bindPopup` takes a raw
HTML string and would have executed both. **Do not switch to it.**

One HTML-string path remains — `divIcon`'s `html` option for the pins. Audited:
only a union type and a boolean reach it, never a listing field. There is a
comment on it saying not to interpolate text there.

---

---

## Where we actually are — verified, not assumed

Everything below was checked by running it, not inferred from commit messages.

| Check | Result |
|---|---|
| Rust module compiles | ✅ `cargo check` clean, 431 lines |
| TypeScript typecheck | ✅ clean |
| Client tests | ✅ 24 passing |
| Production build | ✅ clean |
| No unescaped HTML paths | ✅ only the two `divIcon` html strings, both static markup |
| No data fetching | ✅ no fetch, axios, useQuery, setInterval, or store |
| No reducer takes an `Identity` argument | ✅ `display_name` and `open_claims` take one but are **private helpers**, not reducers — fine |
| No secrets, no leftover scratch files | ✅ |

**Phase position: Phases 0–3 complete. Phase 4 complete except the visual pass,
the writeup and submission. Phase 5 in progress.**

Shipped in Phase 5 so far: the scheduled expiry ticker, `seed_board` as its own
callable reducer, the `claim_attempt` event table, the contention stress test,
and `docs/why-spacetimedb.html`.

### One thing is out of sync and it blocks V

**The server has `claim_attempt` and `expiry_tick`; the generated bindings do
not.** `client/src/module_bindings/` still contains only `user` and `listing`.
The client compiles because it is internally consistent — it simply cannot see
the new tables.

So the contention ticker cannot be built yet. It needs one
`spacetime generate` (and a publish, if the module has not been republished
since the event table landed). This is the single blocking item between the two
of us.

## Task breakdown from here

No fixed clock times — the ordering and the stop rule are what matter.

### E — backend, then stop

1. **Republish and regenerate.** Unblocks V's ticker. Do this before starting
   anything new. Announce it.
2. **Verify the losing claim's event row survives.** `claim_listing` returns
   `Err` on the losing path, which aborts the transaction — the
   `claim_attempt` insert is inside it and may roll back. The code already
   carries a note saying to check. Whatever the answer, write it into this
   file; "we found the transaction boundary the hard way" is a good answer to
   "what surprised you".
3. **`pickup_contact` + `#[client_visibility_filter]`** — the last schema item.
   Moving donor address and phone out of `listing` is a *field removal* and
   breaks V's client, so flag it as that, not as "schema changed".
4. **Per-user `my_pickups` view**, if the rest landed comfortably.
5. **Demo script written out and rehearsed.** Phase 4, still open, and E gives
   the technical pitch.

### V — client, then polish

1. **Drawings — start now, blocks on nobody.** Race diagram first (it leads the
   Devpost), then custom map pins as SVG, then a wordmark, then an empty-state
   illustration.
2. **Contention ticker** — waits on E's regenerate. Event-table rows are never
   stored client-side, so it must be driven by `useTable`'s `onInsert`, not by
   reading rows. Cap the display: the stress test fires 50 claims, so a run
   produces a burst of 50 events.
3. **Wire `openListings`** — `queries.ts` is ready; the swap is one line in
   `App.tsx`, which is E's file.
4. **Adapt to the contact-field removal** when item 3 of E's list lands.
5. **Final visual pass** — Phase 4, still open.

### E+V together

- Re-run the two-laptop simultaneous claim after the schema pass. It changes the
  claim path, so the earlier test no longer covers it.
- Run the stress test on a real laptop. It has never been fired against a live
  database; the sandbox cannot reach Maincloud.
- Devpost writeup and submit.

## The rule that governs the rest of this build

The prize criterion is **most polished app**. That inverts how unfinished work
scores: under a depth criterion a half-built feature still reads as ambition;
under a polish criterion it is a visible defect.

So: **work in priority order and stop when the next item cannot be finished
properly.** Nothing here is a list to complete. Anything still half-built when
we move to polish gets **reverted**, not shipped — that is what `demo-v1` is
for. Finishing beats adding, every time, from here to submission.

---

## Phase 4 — Integration and demo (hours 20–32)

- [x] **E+V** Two-laptop testing against the **same** module instance
- [x] **E+V** Simultaneous-claim test through the real UI — done; re-run after
      the Phase 5 schema pass, since that changes the claim path
- [ ] **E+V** Fix whatever that surfaces (it will surface something)
- [ ] **V** Final visual pass
- [ ] **E** Demo script written out and rehearsed at least three times
- [ ] **E+V** Devpost writeup — screenshots, the technical argument, repo link
- [ ] **E+V** Submit. Still open. A stub entry is free and editable — put one up
      whenever convenient rather than saving it all for the end.

### Demo ownership

**E gives the technical pitch.** The argument you are selling is a backend
argument about serialized transactions resolving a contested claim; the person
who wrote the reducers should be making it. V drives the second laptop and
handles the mission framing and product questions.

---

## Git workflow and merge contract

### Do we need separate branches?

**Phases 0–2: no. Both work directly on `main`.**

Your directories are disjoint — E is in `server/`, V is in `client/`. Git merges
changes to different files without complaint, so branches would buy you nothing
and cost you merge ceremony at 3am. The realistic hackathon failure mode is a
botched rebase under time pressure, not an overwritten file.

**Phase 3: yes, short-lived branches.** Once E joins the frontend you are both in
`client/` and the conflict risk becomes real. One branch per feature, merged the
same day. A branch that lives more than a few hours is a liability.

### The rule for phases 0–2

```bash
git pull --rebase origin main    # before you start, and before every push
# ... work ...
git add -A && git commit -m "..."
git push origin main
```

`--rebase` keeps history linear and avoids merge commits nobody will read.
Push at least every hour — an unpushed laptop is an unbacked-up laptop.

### The rule for phase 3

```bash
git checkout -b feat/post-form      # E
git checkout -b feat/map-popups     # V
# ... work, commit ...
git push -u origin feat/post-form
git checkout main && git pull --rebase origin main && git merge feat/post-form
git push origin main
```

Merge your own branch as soon as the feature works. Do not batch them.

### File ownership

| Path | Owner | Rule |
|---|---|---|
| `server/` | E | V does not edit, ever |
| `client/src/module_bindings/` | E | **Generated output.** Never hand-edit. Only E regenerates and commits. |
| `client/` (everything else) | V | E edits only in Phase 3, on files agreed out loud |
| `CLAUDE.md`, `PLAN.md` | E+V | Update when reality diverges from the plan |

Ownership is what actually prevents conflicts — branches only defer them.
Respect the table and you will barely see a conflict all weekend.

### Two rules that prevent the expensive failures

1. **Never hand-edit `module_bindings/`.** It is generated. Editing it means your
   client and your module silently disagree, and you will not find out until the
   demo. If the types are wrong, fix the schema and regenerate.
2. **Announce every schema change out loud.** E republishes, regenerates, commits,
   and *says so*. V pulls immediately. A silent schema change is the single most
   expensive mistake available to you.

### If you do hit a conflict

Do not fight it under time pressure. The person who owns that file per the table
above wins — take their version wholesale (`git checkout --ours` / `--theirs`),
confirm out loud, move on. Reconstructing a clever merge at hour 28 is how teams
lose demos.

## Risk register

| Risk | Trigger to watch for | Response |
|---|---|---|
| Toolchain will not cooperate | Hour 1.5 with no live update | **Bail out.** Pivot to the memetics or marimo track. Set a real alarm. |
| Stale API examples | Macro or method "does not exist" errors | Stop searching. Open the current official quickstart and copy exact syntax. Do not trust blog posts, Stack Overflow, older tutorials, or an AI assistant's memory. |
| Schema change after Phase 1 | E wants "one more field" | Allowed but expensive: republish, regenerate, commit, tell V in person immediately. |
| E idle after backend | Hour 10, backend done | Move to Phase 3 frontend tasks. Do not gold-plate the module. |
| Demo fails live | Simultaneous claim is flaky in the UI | Have the saved CLI race output as a fallback proof. Rehearse three times. |
| Grey box instead of a map | Leaflet renders nothing | Missing CSS import. |
| Submission deadline | Hour 30 | Submit a working-but-unpolished build early, then update it. A late perfect build scores zero. |

---

## Scope guard

Everything in `CLAUDE.md` under **Explicitly NOT in scope** stays out until the
core loop is finished, demoed and stable. Suggest features, do not build them.

The one exception worth revisiting if you are comfortably ahead at hour 20:
**scheduled reducers** for auto-expiring listings past their pickup window. It is
cheap, and it demonstrates a SpacetimeDB feature most teams will never touch —
the database calling your code on a timer with no client involved. That is
directly on-track for the judges. Nothing else on the cut list is.
