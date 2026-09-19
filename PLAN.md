# PLAN.md — Task breakdown and ownership

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
- [~] Test every reducer from the CLI — **PARTIAL.** `post_listing` is covered
      (the seed run, plus the `999 999` rejection confirming validation is
      deployed). `set_name`, `claim_listing`, `unclaim_listing` and
      `complete_listing` have only been exercised through the UI.
- [ ] **Prove the race.** Fire two `claim_listing` calls at the same listing as
      fast as possible and confirm exactly one wins. Save the terminal output —
      this is demo evidence. **STILL OPEN — the last real item in Phase 2.**
- [x] Write a seed script — `server/seed.sh`, 15 Baltimore listings, run and
      verified in `spacetime sql`
- [ ] Learn `spacetime logs` for debugging

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

---

## Phase 3 — E joins the frontend (hours 10–20)

Backend is done. Do not go looking for more backend work.

- [ ] **E** Post-listing form (donor, description, pickup-by, location picker)
- [ ] **E** "My pickups" view — claimed-by-me listings, with unclaim and complete
- [ ] **V** Map polish: clustering if needed, popups, pickup-window display
- [ ] **V** Empty states, loading state, connection-lost state
- [ ] **E+V** Run the seed script and look at a full board for the first time

---

## Phase 4 — Integration and demo (hours 20–32)

- [ ] **E+V** Two-laptop testing against the **same** module instance
- [ ] **E+V** Simultaneous-claim test through the real UI, repeatedly, until reliable
- [ ] **E+V** Fix whatever that surfaces (it will surface something)
- [ ] **V** Final visual pass
- [ ] **E** Demo script written out and rehearsed at least three times
- [ ] **E+V** Devpost writeup — screenshots, the technical argument, repo link
- [ ] **E+V** Submit. Do not leave this to the last 20 minutes.

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
