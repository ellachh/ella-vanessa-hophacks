# PLAN.md — Task breakdown and ownership

> ## STATUS — read this before anything else
>
> *(This block was stale after the last merge — it still described main as
> five tables awaiting a publish. Rewritten against what is actually there.)*
>
> **`main` carries everything and is green.** Seven tables, one view, fifteen
> reducers, three procedures, the Ask panel, photos, shopfronts and the
> geocoder. Published to Maincloud, bindings regenerated, Netlify deploying
> from it.
>
> **Netlify auto-deploys `main`**, so a broken push there is a broken public
> link. Run `npm run build` before pushing to it. A failed build does not
> deploy and the last good one stays up.
>
> **A known-good fallback exists: the `demo-v1` branch.** Last verified commit
> before the Phase 5 schema work. **Do not delete or force-push it.**
>
> ### ⚠️ `claude/elegant-archimedes-vqqdy1` needs one more publish + regenerate
>
> It renames the roles in the UI, makes the placeholders generic, and adds a
> store photo — which is a new table, `donor_photo`, taking the module to
> **eight tables and seventeen reducers**.
>
> Four `tsc` errors right now, all "generated symbol does not exist":
> `donorPhoto`, `saveDonorPhoto`, `removeDonorPhoto`. Rust builds for
> `wasm32-unknown-unknown`; 43 tests pass.
>
> ```bash
> cd server/spacetimedb && spacetime publish food-pickup --yes
> spacetime generate --lang typescript --out-dir ../../../client/src/module_bindings
> cd ../../client && npx tsc -b && npm test && npm run build
> ```
>
> `donor_photo` is a **new table**, so the migration is clean — no
> `--delete-data`, and the xAI key in `secret` survives.
>
> ### Naming: the UI says Store, the schema says donor
>
> Deliberate. Renaming a live table or column is a migration this database
> will refuse, and the schema word never reaches a user. So `donor_profile`,
> `donor_photo` and `listing.donor` keep their names while the interface says
> Store, and the mode union in `App.tsx` is still `'volunteer' | 'donor'`.
> Do not "fix" the mismatch by renaming the schema.
>
> ### Still not exercised against the live database
>
> 1. **Photo size.** `MAX_PHOTO_CHARS` is 140_000, chosen conservatively, not
>    measured against a documented row limit. Post one listing with one photo
>    before posting several. If refused, lower it in `lib.rs` *and* `photo.ts`
>    together and drop `MAX_EDGE` to 480 — the client cap must never exceed
>    the module's.
> 2. **Whether Maincloud reaches `nominatim.openstreetmap.org`**, and whether
>    its shared IP trips the rate limit. Fails to a sentence either way, and
>    the pin drop still works — so keep the address lookup off the demo path.
> 3. **Does `grok-3` accept image input?** `DEFAULT_MODEL` is `grok-3` and the
>    caption feature sends an `image_url`. If it 400s, set `xai_model` to a
>    vision model — note that switches `ask_scraps` too, since they share it.
> 4. **The stacked panel with a photo in it.** `.panel--stack .panel__photo`
>    caps it at 150px so the claim button cannot fall below the fold. Reasoned,
>    not seen.
>
> **Nothing is submitted to Devpost yet.** Still the only unrecoverable one.
>
> Phase 5 plans and both per-person briefs live in `PROMPTS.md`.

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
spacetime generate --lang typescript --out-dir ../../client/src/module_bindings
```

### Three things that turned out not to work as planned

**1. Row-level security is not implemented in 2.10.1. The `pickup_contact`
table was cut.** `#[client_visibility_filter]` is behind the crate's `unstable`
feature and carries `// TODO: RLS filters are currently unimplemented, and are
not enforced.` It compiles, publishes, and does nothing. Shipping it would have
meant claiming row-level security in the pitch while every client still received
every contact row. **Do not describe Scraps as having row-level security.** If a
judge asks what we would add next, this is a good honest answer.

**2. An `Option` column cannot be an index-filter argument.** `claimed_by` is
the natural index for "my pickups", but `.claimed_by().filter(Some(who))` does
not compile. Combined with the fact that a `#[view]` may only start from an
index and cannot call `iter()`, `my_pickups` starts from the `completed` index
and narrows to `ctx.sender()` in Rust. That is why the index is on `completed`
and not where you would expect.

**3. `.update()` lives on the primary key, not on any index.**
`.claimed_by().update(...)` does not exist; it is `.id().update(...)`.

### Expiry is confirmed working in production — and it will eat your board

Observed live: a board seeded hours earlier came back with only 6 listings, all
of them claimed. That is exactly the signature of `expire_listings` doing its
job — unclaimed listings past their pickup window were deleted, claimed ones
were left alone.

Good evidence the scheduled reducer works. Also a trap:

- Seeded windows are 2–8 hours from the moment of seeding. Leave the board
  overnight and every unclaimed listing is gone.
- `seed_board` no-ops when any listing exists, so a board that is entirely
  claimed **cannot be refilled with it**.

Use `reset_board` instead: it wipes every listing and re-seeds with windows
measured from now.

```bash
spacetime call food-pickup reset_board
```

Run it before each rehearsal and once more before judging.

## PHASE 6 — radius filter (done) and the AI recommender (planned)

### 1. Radius filter — SHIPPED

**What a volunteer sees:** a blue "you are here" pin on the map, a shaded circle
showing how far they will travel, and chips for 1 / 2 / 3 / 5 mi / Any. Drag the
pin and the board re-scopes around the new position.

**Why it is a SpacetimeDB demonstration and not a list filter:** the radius and
the pin position are part of the **subscription query**. `listingsWithin()`
builds `.gte()`/`.lte()` bounds on `lat` and `lng`, so narrowing the radius makes
the server stop producing those rows — they are never sent. Open DevTools →
Network → WS and shrink the radius; traffic drops.

**Bounding box server-side, true circle client-side.** The query builder compares
columns to literals and has no trigonometry, so the server does the huge cheap
reduction and `withinRadius()` trims the corners over the handful of rows that
survive. There is a test proving the trim rejects a point the box admits.

**The count reads "7 pickups", never "7 of 15" — on purpose.** We cannot know the
total; those rows were never sent. Displaying one would mean subscribing to the
whole table, which is the thing being avoided. *The number being un-knowable is
the feature working*, and that is the line to use if a judge asks.

**Files:** `radius.ts`, `RadiusFilter.tsx`, `YouAreHere.tsx`, `RadiusFilter.css`
(E). One additive change to `MapView.tsx` (V's): a `children` slot, because
react-leaflet overlays must live inside `<MapContainer>`. Nothing else of V's
was touched.

**Pin position persists** in `localStorage` under `scraps.center`, wrapped in
try/catch. Per-viewer convenience only — never shared, never read back by us.

---

### 2. AI recommender — SHIPPED and verified against Maincloud

**`ask_scraps` is a `#[procedure]`: the database itself calls the model.** Not a
React component calling an API next to the database — the database, holding a
transaction open just long enough to read the board, closing it, then making an
outbound HTTPS request.

Verified live:

```
$ spacetime call -- food-pickup ask_scraps '"something sweet"' '39.2904' '-76.6122'
["Hampden Coffee Collective has pastries.", 12291, false]

$ spacetime call -- food-pickup ask_scraps '"what is closest to me right now"' ...
["The closest is Ekiben, right where you are.", 16386, false]

$ spacetime call -- food-pickup ask_scraps '"anything that expires soon"' ...
["Ekiben has only 48 min left, closest by far.", 16386, false]
```

Different questions pick different pickups — it is reasoning over the board, not
keyword matching.

**Why this is the interesting half.** Reducers must be deterministic: no network,
no clock, no filesystem. That is not a limitation to work around, it is the same
all-or-nothing property that makes two simultaneous claims resolve to exactly one
winner. A reducer that could call an API could not offer that guarantee.
Procedures exist for precisely the work reducers must refuse — so the honest
framing is *"we could not put it in the write path, and here is the mechanism the
database gives you instead."*

**Grounding.** The model receives every open unclaimed pickup with its distance
from the volunteer's pin and minutes remaining. A returned `listing_id` is
discarded unless it appears in the context we supplied, so it cannot point at a
listing it invented.

**Injection.** `serde_json` builds the request body. `donor` and `description`
are free-form input from anonymous clients; hand-rolling that JSON string would
let a description full of quotes and braces restructure the request.

**Secrets.** Key and model name live in the private `secret` table — no `public`,
so codegen skips it and no client can read it. Nothing ships in the bundle.

**The model id is configurable without a republish:**

```bash
spacetime call food-pickup set_secret '"xai_model"' '"grok-3"'
```

#### Two fixes after the first live run

- The model wrote `id=12291` into the prose. Ids are for the app, not the
  reader; the prompt now forbids it and says to name the donor instead.
- A listing posted at the default pin rendered as `0.0 mi away`, which reads
  like a bug. Anything under a tenth of a mile is now "right where you are".

#### Stop rule

Spike → key storage resolved → hello-world procedure → the real one. **If any
step fails, stop and keep the build as it is.** Under a polish criterion a
half-built AI panel is worse than none, and `demo-v1` plus today's verified
build are what we are protecting.

---

## VERIFICATION LOG — everything below has been run against Maincloud

Nothing in this project is asserted without having been run. Final pass:

| Test | Result |
|---|---|
| Stress test, 50 concurrent claims, in-browser | **50 fired · 1 succeeded · 49 rejected · 85ms** |
| Two-laptop live propagation | Pass — post on one, appears on the other untouched |
| Two-laptop contested claim | Pass — one winner, loser sees `Ella claimed this first.` |
| Completion clears both boards | Pass — survived the subscription scoping to `completed = false` |
| Scheduled expiry, two laptops | Pass — pin vanished from both, `expired listing=N` in the log |
| CLI race, two concurrent calls | Pass — one exit 0, one exit 1, one holder in the row |
| Cross-identity authorization | Pass — `complete_listing` on V's claim returns `You don't hold this claim.` |
| Coordinate validation | Pass — `999 999` rejected with `That location is off the map.` |
| Losing `claim_attempt` survives rollback | **No** — see below. Design kept as is. |

**The number worth quoting: 50 concurrent claims, exactly one write survived,
85 milliseconds, no locking code.** A judge can reproduce it on our laptop in
about four seconds — the stress test is behind "Prove the race →" in the listing
panel and releases its own claim, so it can be run repeatedly.

Expiry also proved itself unprompted: a board left overnight came back with only
claimed listings, every unclaimed one having been deleted on schedule. Nobody
staged that.

---

### ANSWERED: the losing claim_attempt row does NOT survive

Tested live against Maincloud. Two concurrent claims on listing 8208, one
subscriber watching `claim_attempt`. The subscriber received exactly one row:

```json
{"listing_id":8208,"who":{"__identity__":"0xc200af83…"},"won":true,
 "at":{"__timestamp_micros_since_unix_epoch__":1789830597098592}}
```

Only `won: true`. The loser's insert was discarded.

**Why:** a reducer returning `Err` aborts its transaction, and the insert
happened inside that transaction. There is no partial commit — that is the same
property that makes the contested claim safe in the first place. The guarantee
we are demonstrating is precisely the thing that eats the loss record.

**Consequence: a `claim_attempt` ticker can only ever show winners.**

#### The two designs, and why we are keeping the current one

| | Keeps rejection toast | Ticker shows losses |
|---|---|---|
| **Today** — `Err` on loss | yes | no |
| **Alternative** — always `Ok`, outcome in the event row | no | yes |

The alternative works: `claim_listing` returns `Ok(())` on every path, writes
`won: true/false`, and the client fires the toast from `onInsert` when a row
arrives with `who == me && !won`. That gets both.

**We are not doing it.** The toast is the demo centerpiece — it is what makes the
mechanism visible on the loser's own screen at the moment it matters. Trading a
working, verified centerpiece for an ambient ticker, hours out, under a judging
criterion that reads *polished*, is the wrong bet. A winners-only feed is still
a live claim feed.

If a ticker ships, it shows winners. If it cannot be finished properly, it does
not ship at all.

#### This is our best "what surprised you?" answer

We predicted the behaviour in a code comment, wrote the test, ran it, and got a
result that closed off a feature. The transaction boundary is not a detail we
read about — it is one we found, and the thing that broke is the same thing that
makes the whole project correct.

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
spacetime generate --lang typescript --out-dir ../../client/src/module_bindings
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
`../../client/src/module_bindings` is correct. `../../client/...` would climb above
the repo entirely.

Verify empirically after the first generate — this is a thirty-second check that
settles any doubt:

```bash
ls ../../client/src/module_bindings     # expect generated .ts files
find .. -name module_bindings -type d   # expect exactly ONE hit, under client/
```

If a stray `server/client/` ever appears, delete it and re-run from `server/`.

Getting `--out-dir` wrong fails silently — it writes bindings to a real but
wrong directory and V never sees them. From `server/` it is
`../../client/src/module_bindings`.

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

The one generated thing you **do** commit is `../client/src/module_bindings/`, so
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
- [x] **E** From `server/`: `spacetime generate --lang typescript --out-dir ../../client/src/module_bindings`
- [x] **E** Commit the generated bindings (`f761e6a`)
- [x] **V** In parallel: scaffold `client/` — Vite + React + TypeScript
- [x] **V** Install deps: SpacetimeDB TS SDK, `leaflet`, `react-leaflet`
- [x] **V** Import Leaflet's CSS and render a bare map centered on Baltimore.
      *If the map is a grey box, the CSS import is missing.*

**Phase 1 exit criteria:** `../client/src/module_bindings` exists and is committed;
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
into `../client/src/module_bindings/` and committed.

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

Change these in `../server/spacetimedb/src/lib.rs` if the wording should differ, but
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
not.** `../client/src/module_bindings/` still contains only `user` and `listing`.
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

## Donor mode — the one late request that was built

V asked again for the role split after the verification layer was declined, and
this one is different in kind: **a role switch claims nothing.** It is a view
over data we already hold, not an assertion that we check anyone's identity.
Verification stays cut for the reasons below; the split shipped.

**Volunteer / Donor switch in the header.** Donor mode lists what you posted and
what has happened to each — waiting for a volunteer, or the name of the person
collecting it. No new table, no new query, no new reducer: `posted_by` is
already on every listing, so it is the same subscription read by who posted
rather than who claimed.

**Worth adding to the demo.** When a volunteer claims one of these, the row
changes under the donor with no refresh. It is the contested-claim moment seen
from the other side of the transaction, and it costs nothing to show.

Two behaviours that are not obvious from the code:

- **Switching to donor mode clears the travel radius.** The radius is a
  volunteer's "how far will I drive"; a restaurant's own listings must never be
  hidden from them by it.
- **"Post a pickup" appears only in donor mode**, and "Your pickups" only in
  volunteer mode. Having both in both was what made the split feel cosmetic — a
  volunteer collects food, they do not put it up.

## Header crowding — fixed, and the cause is worth remembering

Five groups had accumulated in the header: title, tagline, count, radius filter,
and three action buttons. At 1280px the tagline, the count and both buttons all
wrapped, and the radius filter's count orphaned onto a second line — which made
the bar **82px in volunteer mode and 56px in donor mode**, so every mode switch
shifted the whole layout.

The radius filter moved onto the map as a floating control, where it belongs:
it is a map control, not a title-bar control. Header is now 56px in every mode.

**The cause is that each of us added one thing to the header and neither
addition was wrong on its own.** Nothing in the ownership table catches that.
If either of us adds a third header element, look at it at 1280px first.

## The App.tsx collision finally happened

The Phase 3 ownership table gave `App.tsx` to E precisely to avoid this, and it
happened anyway — because the mode switch has to live in the composition root,
which is the same place the radius controls do. Ella's `YouAreHere` import and
V's `RestaurantView` import landed in the same block.

Resolved keeping both; nothing of Ella's was dropped. The lesson is not that the
table was wrong, it is that a composition root cannot be owned by one person
once both are adding top-level UI.

## Feature requests raised late — all three declined, with reasons

V asked for three additions after the build was verified. Recording them here
because they are good product ideas that we are choosing not to build, and the
reasoning is worth more than the features would have been.

### 1. Restaurant role with a verification layer — **cannot be done honestly**

This one is a different kind of no from the other two. We have no email, no
phone, no identity provider and no business registry. Identities are anonymous
tokens in `localStorage`. A "verification layer" would be a checkbox reading
*I am a restaurant* that anyone can tick.

And per trap #8, row-level security does not work on 2.10.1, so we could not
restrict who sees what even if we wanted to. Every table is genuinely
world-readable.

So a judge asks how we verify a restaurant and the honest answer is "we do
not" — after we put a control in the UI implying we do. That is a worse moment
than not having the feature, in front of the people who wrote the database.
**Do not ship a control we cannot back.**

### 2. History of past pickups — buildable, but invasive right now

`completed` listings still exist in the database. But the subscription is now
scoped server-side to open listings within a radius, so completed rows are no
longer *sent to the client*. History needs a second subscription — which
changes the exact thing verified against Maincloud in the pass before it.

Cheapest of the three if we ever do one. Not before submission.

### 3. Pinned / favourite restaurants — a fifth table for no new depth

Needs a table, a reducer and UI. It would not demonstrate SpacetimeDB more
than what we already have: four tables, an event table, a scheduled reducer, a
server-side view, a transaction-enforced ceiling and scoped subscriptions.

### Where the value goes instead

All three belong in the Devpost's **"What's next"** section. Judges read it, and
it is where product thinking scores without shipping anything half-built.
Written properly, *"verification needs a real identity provider, and here is why
we did not fake one"* reads as judgment. A checkbox reads as a gap.

### The rule this is an instance of

From CLAUDE.md, and it holds for anything either of us is tempted by from here:

> A half-built feature is worse than a missing one. Finishing beats adding,
> every time, from here to submission.

**The state as of this note: 15 hours in, the build is done and verified, and
we have not submitted.** That is the only outstanding risk. Nothing on this
page is worth more than closing it.

---

## Screenshots — regenerated after the rename

The earlier set all said *Relay* and are stale. Regenerated at 2x, tab title
confirmed on each: board, race toast, stress-test result, your pickups, post
form, name gate. Ella's radius filter is in the frame.

They are rendered against stub rows with placeholder map tiles, because the web
sandbox cannot reach OpenStreetMap or Maincloud. **For the Devpost, reshoot on a
laptop** so the tiles are real streets — everything else is identical.

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
| `../client/src/module_bindings/` | E | **Generated output.** Never hand-edit. Only E regenerates and commits. |
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

---

# PHASE 7 — photos, profiles, geocoding, and a Grok suggestion

On branch `claude/elegant-archimedes-vqqdy1`. Four features V asked for, built
together because they share a schema change and one publish.

## What was added

**Two new tables. No column was added to any existing table** — trap #9 makes
that unpayable on a live database, and it is why both of these are tables
rather than fields.

| Table | Shape | Why it is its own table |
|---|---|---|
| `donor_profile` | `identity` PK, name, bio, address, lat, lng | Columns on `user` would need a default-value migration. New tables migrate cleanly. |
| `listing_photo` | `listing_id` PK, data_uri, posted_by | A photo is ~1000x a listing row and every client subscribes to the board. Kept out of `listing` so the board stays cheap. |

| Reducer | Behavior |
|---|---|
| `save_donor_profile(name, bio, address, lat, lng)` | Upsert against `ctx.sender()`. Identity is never a parameter. |
| `post_listing_with_photo(..., photo)` | Listing and photo in one transaction. `post_listing` is untouched and still works. |
| `attach_photo(listing_id, data_uri)` | Ownership-checked against `listing.posted_by`. |
| `remove_photo(listing_id)` | Ownership-checked against `photo.posted_by`. |

| Procedure | Behavior |
|---|---|
| `geocode(address) -> GeoResult` | Nominatim lookup. |
| `suggest_description(donor, note) -> Suggestion` | Grok, key read from the private `secret` table. |

`expire_listings` now also sweeps photos whose listing is gone or delivered —
in the scheduled reducer rather than in each deleting path, so no future
deletion path can leak one. `reset_board` drops them immediately instead of
waiting for the next tick, because a rehearsal should not start with the last
run's photos on the board.

## Why the geocoder runs in the database

Not architectural preciousness. **Nominatim's usage policy requires a
descriptive `User-Agent`, and the browser fetch API will not let a page set
that header** — it is on the forbidden list and is silently dropped. A
procedure can set it, so the request we actually make is the one their policy
asks for. It also keeps V's standing rule intact: there is still no `fetch`
anywhere in `client/`.

This is a better answer to a judge than the Grok feature, because it is a case
where "the logic lives in the database" is *load-bearing* rather than stylistic.

## The API key

Unchanged from the spike: `set_secret` writes `xai_api_key` into the private
`secret` table, which has no `public`, is skipped by codegen, and is
unreachable over a subscription. Nothing is in the bundle and nothing is in
the repo.

```bash
spacetime call food-pickup set_secret '"xai_api_key"' '"xai-..."'
```

**Without it, `suggest_description` returns `ok: false` and the sentence "No
model key is set on this database."** The button shows that as a toast and
posting is unaffected. The feature is a suggestion on a field the donor can
type themselves — it was shaped that way so that a dead key, a slow model or
no network costs nothing during a demo.

## Files touched, against the Phase 5 ownership table

V's files, as usual: `photo.ts`, `PhotoInput.tsx`, `MapPicker.tsx`,
`DonorProfileForm.tsx`, `ListingPanel.tsx`, `RestaurantView.tsx`, `queries.ts`,
`index.css`, `PostForm.css`, `DonorProfile.css`, `__tests__/photo.test.ts`.

**Three of E's files were edited, deliberately, and they are the ones to look
at first:**

- `../server/spacetimedb/src/lib.rs` — all additive. Nothing existing changed
  except the two cleanup lines in `expire_listings` and `reset_board`.
- `server/spacetimedb/Cargo.toml` — added `serde_json`. Both procedures parse
  JSON. Pure Rust, compiles to wasm.
- `PostForm.tsx` — rewritten: the pin picker moved out to `MapPicker.tsx` so
  the profile form could share it, plus the photo input, the suggestion card,
  and prefill from the profile.
- `App.tsx` — **one line**: `onError={setToast}` passed to `RestaurantView`.

## Verification — what has and has not been run

| Check | Result |
|---|---|
| `cargo check --target wasm32-unknown-unknown` | **Pass** — the real target, not the host |
| Client tests | **43 pass** (32 before, +11 for the photo sizing rules) |
| `oxlint` | Clean, apart from the two pre-existing fast-refresh warnings |
| `tsc -b` | **10 errors, all "generated symbol does not exist"** — closed by regenerate |
| Anything against a live database | **Not run.** No 2.10.x CLI in the web sandbox: it is not on crates.io, and both the installer and GitHub releases are blocked by the proxy. |

**So the untested surface is exactly the wire format**: whether the generated
param shape for a procedure is a single object (`geocode({ address })`) the way
it is for a reducer. If it turns out to be positional, it is a one-line change
per call site and `tsc` will say so immediately.

## Three unknowns that only a live database will settle

Listed because each has a cheap first test, and doing that test before the
rehearsal is much better than finding out during one.

1. **Is 140 KB under SpacetimeDB's row or message limit?** `MAX_PHOTO_CHARS`
   was picked to be comfortably small, not against a documented ceiling — the
   limit is not something the sandbox could check. **First test: post one
   listing with one photo.** If the insert is rejected, lower the constant in
   `lib.rs` *and* `photo.ts` together and drop `MAX_EDGE` to 480; they are
   mirrored on purpose and the client cap must not exceed the module's.
2. **Can Maincloud reach `nominatim.openstreetmap.org`?** The procedure is
   written correctly; whether the host's egress allows it is a separate
   question. It also rate-limits to roughly one request a second per IP, and
   Maincloud is shared infrastructure, so a 429 is possible. Either way it
   fails to a sentence and the pin drop still works. **Do not put the address
   lookup on the demo critical path** — set the profile up beforehand.
3. ~~**Is a procedure's generated parameter shape a single object?**~~
   **Settled.** `AskPanel.tsx` calls `askScraps({ question, lat, lng })` against
   E's regenerated bindings, so procedures take one params object exactly the
   way reducers do. `geocode({ address })` and
   `suggest_description({ donor, note })` are the right shape.

## Things worth knowing before demoing this

- **The photo is the only user-supplied thing on the board that is not text.**
  It is checked twice before it reaches an `<img src>`: `check_photo` in the
  module and `isSafePhotoSrc` in the client, both against the same three
  `data:image/...;base64,` prefixes. Neither is the only check.
- **A photo makes the board heavier.** One 720px JPEG is ~50 KB. The photo
  subscription is scoped to the selected listing precisely so fifteen of them
  are not fifteen downloads — `photoFor(id)` in `queries.ts`. That scoping is
  worth showing in DevTools next to the "one websocket, no polling" point.
- **The claim ceiling still bites at three.** Unrelated, but it is the thing
  that surprised V last time.

---

## Merging Phase 7 with Ask Scraps — done, and what it cost

`origin/main` was merged into `claude/elegant-archimedes-vqqdy1` after E landed
`ask_scraps`. It is clean now, but not because git said so.

**Git reported one conflict (`Cargo.toml`) and it was the harmless one** — we
had both added `serde_json`, differing only in the comment above it.

**`lib.rs` auto-merged and did not compile.** We had each written a struct
called `Suggestion`: E's is `{ answer, listing_id, failed }` for the assistant,
mine was `{ ok, text, error }` for the description drafter. The two definitions
sit hundreds of lines apart, so there was no textual overlap for git to notice
— it produced a file with the name defined twice and 19 cascading errors.
Mine is now `DescriptionDraft`, which is the better name anyway.

**Worth remembering:** a clean `git merge` on a Rust module means the *text*
did not overlap. It says nothing about whether the result compiles. Always
`cargo check --target wasm32-unknown-unknown` after merging this file.

**One thing was made consistent rather than merely compatible.**
`suggest_description` now reads the same `xai_model` secret and the same
`DEFAULT_MODEL` fallback that `ask_scraps` uses, instead of hardcoding a model
name. Two AI features disagreeing about which model to call is a failure that
only surfaces on whichever one gets demoed second.

So one key and one model setting serve both:

```bash
spacetime call food-pickup set_secret '"xai_api_key"' '"xai-..."'
spacetime call food-pickup set_secret '"xai_model"' '"grok-3"'   # optional
```

`App.tsx` merged with both sides intact: E's `AskPanel` mount and V's
`onError` passthrough to `RestaurantView`.
