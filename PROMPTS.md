# PROMPTS.md — Starting prompts for each person's Claude session

Paste your section into your own Claude session, in a checkout of this repo.
Both prompts assume `CLAUDE.md` and `PLAN.md` are present — they tell Claude to
read them first, which is what keeps the two halves compatible.

**Before either prompt:** finish Phase 0 in `PLAN.md`. Both laptops must have
published a module and seen a live update. Do not start building on one machine.

**Ella runs hers first.** Vanessa's frontend work needs the generated bindings
that Ella's Phase 1 produces. Vanessa can do her scaffold and dependency install
in parallel, but she is blocked on real types until Ella commits
`client/src/module_bindings/`.

---

## Ella's prompt — backend / SpacetimeDB module

```
Read CLAUDE.md and PLAN.md in this repo before writing any code. I own the
backend (the `server/` directory). Vanessa owns `client/`.

We are building a live food-rescue board on SpacetimeDB for HopHacks, submitting
only to the Best Use of SpacetimeDB track. Two tables, five reducers. The schema
and reducer list are in CLAUDE.md.

Work in this order:

PHASE 1 (do this first, it unblocks Vanessa):
1. `spacetime init` a Rust module in `server/`
2. Write the `listing` and `user` table definitions
3. Write all five reducers as EMPTY STUBS that compile and do nothing
4. Publish the stub module
5. Run `spacetime generate --lang typescript --out-dir client/src/module_bindings`
6. Commit the generated bindings and tell me to tell Vanessa she is unblocked

PHASE 2 (after bindings are committed):
7. Implement the five reducers: set_name, post_listing, claim_listing,
   unclaim_listing, complete_listing
8. Test each one from the CLI with `spacetime call` and verify with `spacetime sql`
9. Prove the claim race: fire two claim_listing calls at the same listing as
   fast as possible, confirm exactly one wins, and save that terminal output —
   it is demo evidence
10. Write a seed script with 12-15 realistic Baltimore listings

CRITICAL CONSTRAINTS:
- The SpacetimeDB macro API has changed between versions. The Rust snippets in
  CLAUDE.md are SHAPE, NOT GOSPEL. Before writing module code, check the current
  official quickstart and `spacetime --help` for exact syntax. Do not write
  SpacetimeDB code from your training memory, and do not trust blog posts or
  Stack Overflow — stale examples are the biggest time sink in this project.
- `claim_listing` must be CONDITIONAL: only write `claimed_by` if it is currently
  None. That conditional is the entire technical argument of our submission.
  Never simplify it into an unconditional write.
- Do not edit anything in `client/` except `client/src/module_bindings/`, which
  is generated output — regenerate it, never hand-edit it.
- Do not add tables, fields, reducers, or features beyond what CLAUDE.md lists.
  See "Explicitly NOT in scope". Suggest ideas, do not build them.
- Keep the module minimal. Every line of Rust is risk. I do not know Rust, so
  explain anything non-obvious as you go.

If something in CLAUDE.md turns out to be wrong, fix the file too so Vanessa's
session stays in sync.

Start with Phase 1 step 1.
```

---

## Vanessa's prompt — frontend / React client

```
Read CLAUDE.md and PLAN.md in this repo before writing any code. I own the
frontend (the `client/` directory). Ella owns `server/`.

We are building a live food-rescue board on SpacetimeDB for HopHacks, submitting
only to the Best Use of SpacetimeDB track. Restaurants post surplus food,
volunteers claim pickups, and every other volunteer's screen updates instantly.

Work in this order:

PHASE 1 (can start immediately, no dependency on Ella):
1. Scaffold `client/` — Vite + React + TypeScript
2. Install: the SpacetimeDB TypeScript SDK, leaflet, react-leaflet
3. Import Leaflet's CSS and render a bare map centered on Baltimore
   (if the map renders as a grey box, the CSS import is missing — this is the
   single most common Leaflet mistake)

PHASE 2 (needs `client/src/module_bindings/` from Ella — ask her before starting):
4. Connect to the module and subscribe to `SELECT * FROM listing` and
   `SELECT * FROM user`
5. Render listings as map markers, driven ONLY by the subscription
6. Name-entry screen on first load, calling the `set_name` reducer
7. Listing detail panel with a Claim button calling `claim_listing`
8. Open vs. claimed visual states — a claimed listing must be obviously
   different at a glance, since watching one grey out in real time is our demo
9. Layout and styling

CRITICAL CONSTRAINTS:
- NO data fetching. No `fetch`, no axios, no polling, no React Query, no Zustand,
  no Redux. You subscribe once, rows change, React re-renders. If you find
  yourself writing code that asks the server for data, stop — you have
  misunderstood the database. Re-read the SpacetimeDB client SDK docs.
- NEVER hand-edit `client/src/module_bindings/`. It is generated from Ella's
  module. If the types look wrong, the schema is wrong — tell Ella, do not patch
  the bindings. Editing them makes the client and server silently disagree and
  you will not find out until the demo.
- Do not edit `server/` at all.
- Do not add features beyond what CLAUDE.md lists. See "Explicitly NOT in scope".
  Suggest ideas, do not build them.
- The SpacetimeDB TypeScript SDK API may differ from your training memory. Check
  the current official docs for the connection and subscription API before
  writing it. Do not guess.

The reducers will be empty stubs at first — that is expected. Build the UI
against the types; the behavior arrives when Ella finishes Phase 2.

If something in CLAUDE.md turns out to be wrong, fix the file too so Ella's
session stays in sync.

Start with Phase 1 step 1.
```

---

---

# PHASE 3 — both of us in `client/`

Phases 0–2 are done. Paste your Phase 3 section below into your session.

## What already exists — do not rebuild any of it

The core loop works and has been verified live on two identities: a claim in one
browser greys the pin in the other with no refresh.

| Thing | Where | State |
|---|---|---|
| Two tables, five reducers | `server/spacetimedb/src/lib.rs` | Done. Validation + `Result` errors. Published to Maincloud as `food-pickup`. |
| Generated bindings | `client/src/module_bindings/` | Done. Generated output — never hand-edit. |
| Connection + subscription | `main.tsx`, `App.tsx` | Done. Two `useTable` calls are the entire data layer. |
| Map + markers | `MapView.tsx` | Done. Amber open / blue yours / grey taken, 280ms transition. |
| Name gate | `NameGate.tsx` | Done. Blocks the board so both volunteers always have display names. |
| Claim / release / deliver | `ListingPanel.tsx` | Done. Never optimistic — the row is the only truth. |
| Race-error toast | `Toast.tsx` | Done. Shows the module's message verbatim. |
| 15 Baltimore listings | `server/seed.sh` | Done. Run it. |

**The one real gap: nothing calls `post_listing` from the client.** Demo beat 2
("Ella posts a listing, it appears on Vanessa's screen instantly") is currently
impossible outside a terminal. That is the highest-value thing left.

## File ownership for Phase 3 — agreed, do not cross

Git merges different files silently. It only fights when you edit the same one.

| File | Owner | Rule |
|---|---|---|
| `PostForm.tsx`, `MyPickups.tsx` (new) | **E** | V does not touch |
| `App.tsx` | **E** for Phase 3 | V has moved out of it — see below |
| `PostForm.css`, `MyPickups.css` (new) | **E** | Keep E's styles out of `index.css` |
| `MapView.tsx`, `ListingPanel.tsx`, `Toast.tsx`, `NameGate.tsx` | **V** | E does not touch |
| `ConnectionGate.tsx` (new) | **V** | V's loading / empty / connection-lost states live here |
| `index.css` | **V** | E appends nothing here |
| `server/**` | **E** | V does not touch |
| `client/src/module_bindings/` | **E** | Generated. Regenerate, never hand-edit. |

**V's first job is to move the connection-state handling out of `App.tsx` into
`ConnectionGate.tsx`.** After that V never edits `App.tsx` again and E owns it
outright, which removes the only file both of us would otherwise fight over.
V does that extraction first and pushes it before E starts.

## Branches — Phase 3 only

```bash
git pull --rebase origin main        # ALWAYS first
git checkout -b feat/post-form       # E    (feat/map-polish for V)
# work, commit
git push -u origin feat/post-form
git checkout main && git pull --rebase origin main && git merge feat/post-form
git push origin main
```

Merge as soon as your own feature works. Do not batch.

---

## Ella's Phase 3 prompt

```
Read CLAUDE.md and PLAN.md first. Phases 0-2 are done — the backend is
finished and the client's core loop works. Do not go looking for more backend
work, and do not rebuild anything in the "What already exists" table in
PROMPTS.md.

I am now working in client/ alongside Vanessa. Work on a branch:
`git pull --rebase origin main && git checkout -b feat/post-form`

FILES I OWN THIS PHASE: PostForm.tsx, MyPickups.tsx (both new), App.tsx, and
my own CSS files. I must NOT edit MapView.tsx, ListingPanel.tsx, Toast.tsx,
NameGate.tsx, ConnectionGate.tsx, index.css, config.ts, identity.ts or
main.tsx — those are Vanessa's and editing them causes merge conflicts.
Put my styles in PostForm.css / MyPickups.css, never append to index.css.

TASK 1 — the post-listing form. This is the priority; demo beat 2 does not
exist without it. Call the postListing reducer with donor, description,
pickup_by, lat and lng. Reducers take a single params object, not positional
arguments. Timestamp has toDate() and microsSinceUnixEpoch. For location,
clicking the map to drop a pin demos far better than lat/lng text fields —
but if that fights me, ship the fields first and improve it after.
The reducer returns Result, so surface its error message rather than
swallowing it, the same way ListingPanel already does.

TASK 2 — a "My pickups" view: listings where claimed_by is my identity, with
release and mark-delivered. The actions already exist in ListingPanel; this is
the fourth screen CLAUDE.md asks for. Identity is a class — compare with
isEqual, never ===. There is a sameIdentity helper in identity.ts.

TASK 3 — still outstanding from Phase 2: prove the race and SAVE THE OUTPUT.
Fire two claim_listing calls at the same listing as close to simultaneously as
possible, confirm exactly one wins, and commit the terminal capture. The risk
register names this as our fallback if the live demo will not connect.

CONSTRAINTS: no fetch, no polling, no React Query, no Zustand — read rows with
useTable, write with reducers. Do not add features beyond CLAUDE.md's Scope.
Merge my branch into main as soon as the form works; do not batch.
```

## Vanessa's Phase 3 prompt

```
Read CLAUDE.md and PLAN.md first. Phases 0-2 are done and verified live. Do
not rebuild anything in the "What already exists" table in PROMPTS.md.

Ella is now in client/ too, so work on a branch:
`git pull --rebase origin main && git checkout -b feat/map-polish`

FILES I OWN THIS PHASE: MapView.tsx, ListingPanel.tsx, Toast.tsx,
NameGate.tsx, ConnectionGate.tsx (new), index.css. I must NOT edit
App.tsx, PostForm.tsx or MyPickups.tsx — Ella owns those this phase.
I must not touch server/ or module_bindings/ at all.

TASK 1 — DO THIS FIRST AND PUSH IT BEFORE ELLA STARTS. Move the connection
handling out of App.tsx into ConnectionGate.tsx: the connectionError branch,
the "Connecting..." branch, and the name-gate branch. App.tsx should end up
just composing things. This is what lets Ella own App.tsx for the rest of the
phase without us colliding.

TASK 2 — the states that live in ConnectionGate: a real loading state, an
empty state for when the board has no open listings, and a connection-lost
state. useSpacetimeDB() gives isActive, identity and connectionError.

TASK 3 — map polish: popups on markers and the pickup-by window displayed
where it reads at a glance. Use react-leaflet's <Popup> with JSX children.
NEVER use Leaflet's bindPopup with an HTML string — listing text is free-form
input from any anonymous client, so that is stored XSS. See CLAUDE.md,
Security.

CONSTRAINTS: no fetch, no polling, no React Query, no Zustand. Do not add
features beyond CLAUDE.md's Scope. Keep claimed-vs-open obviously different at
a glance — watching a pin grey out in real time is the demo. Merge my branch
into main as soon as a piece works; do not batch.
```

## Handoff points

Three moments where you must talk to each other out loud. Everything else can
happen in parallel.

| When | Who | What |
|---|---|---|
| End of Phase 1 | E → V | "Bindings are committed and pushed, pull now." V is blocked until this happens. |
| Any schema change | E → V | "I changed the schema, regenerated, pushed. Pull before you do anything else." |
| Start of Phase 3 | E ↔ V | **Settled** — see the ownership table under PHASE 3. V pushes the `ConnectionGate` extraction first, then E owns `App.tsx`. |
| Before E starts Phase 3 | V → E | "ConnectionGate is pushed, `App.tsx` is yours, pull now." |
| Either of us pushes | → other | Say so. The other person's checkout is a separate machine and does not update by itself. |

---

# PHASE 5 (STRETCH) — only now that the core loop is closed

All four screens exist: post, map, claim, my pickups. That was the gate. Nothing
below starts until the loop is demoed end to end on two laptops.

## The filter for every idea here

**Flash that demonstrates SpacetimeDB counts double. Flash that does not is a
trap.** These are Clockwork's own judges. Map clustering, tile styling and
animation look like progress and prove nothing to them. Depth in the database
is the currency.

Second filter: **each item must be independently demoable.** Stop whenever it
stops being comfortable. Being mid-feature at submission is worse than shipping
three tight things.

## Ranked

### Tier 1 — highest value, low risk

**1. Scheduled reducers — auto-expiring listings.** CLAUDE.md already names this
as the one cut feature worth adding back when ahead.

> Demo: "Nobody touch anything." A pin vanishes from both laptops at once
> because its pickup window passed. **The database called our code on a timer
> with no client involved.**

A second technical claim alongside the race, and one most teams will never
touch. Also fixes a real wart — expired listings currently sit there reading
"Past pickup time". ~20 lines of Rust (a scheduled table plus one reducer).
**E** writes it, **V** does the expiry treatment in the UI.

**2. Presence — who is online.** `client_connected` / `client_disconnected` are
first-class lifecycle reducers. A bool on the existing `user` table; no third
table needed.

> Demo: "2 volunteers online" in the header. Ella shuts her laptop, it drops to
> 1, live.

Shows we understand the connection lifecycle, not just tables and reducers.
**E** writes it, **V** does the indicator.

### Tier 2 — the real flex, if Tier 1 lands comfortably

**3. Presence on the listing itself — "Ella is looking at this".**

> Demo: both of us open the same pin. Before either taps claim, each screen
> already shows the other person is there. Then we race. **The collision is
> visible before the click.**

This is the MMO use case in miniature, which is what Clockwork built
SpacetimeDB for, and it makes the race demo dramatically better because the
audience sees it coming.

**Costs a third table**, which CLAUDE.md explicitly says to resist. That rule
exists for good reasons and this is the one candidate that might earn breaking
it — but it is a decision both of us make out loud, not a thing one session
does quietly.

### Tier 0 — the honest problem these are solving

A fair criticism of Scraps: a chat app has more moving parts than ours. That is
true about *surface area* and false about *depth* — chat has zero contention,
every message is an independent append, which is exactly why it is the tutorial.
Ours exercises the one guarantee that is hard to get right.

But our whole technical argument is currently **one `if` statement, demonstrated
once, by two people tapping in a coordinated way.** A judge can fairly say "that
is just a conditional." The answer is not to bolt on unrelated features. It is
to use the database for more of the things a backend normally does.

Everything below is a **proposal, not a decision.** Nothing here is built. Pick
deliberately and stop early; three finished things beat six half-built ones.

---

**4. Contention stress test — client-side, ~30 lines, V.**

Fire many claims at one listing at once and tally the outcomes:

```ts
const results = await Promise.allSettled(
  Array.from({ length: 50 }, () => claimListing({ id })),
)
const won = results.filter((r) => r.status === 'fulfilled').length
// won === 1, always
```

> 50 claims fired simultaneously · 1 succeeded · 49 rejected
> 0 double-claims, 0 lost writes, 0 lines of locking code.

Two people tapping is an anecdote; fifty simultaneous calls is a demonstrated
guarantee a judge can trigger themselves. This is the cheapest answer to "that
is just a conditional."

**5. Event table — a live contention feed. E (Rust) + V (ticker UI).**

Event tables are a SpacetimeDB feature most people do not know exists: rows are
never stored in the client cache, only `onInsert` fires. They are for transient
broadcast, which is exactly what a claim attempt is.

```rust
#[spacetimedb::table(accessor = claim_attempt, public)]
pub struct ClaimAttempt {
    listing_id: u64,
    who: Identity,
    won: bool,
    at: Timestamp,
}
```

Today only the loser learns they lost, through their own `Result`. With this the
whole board sees every attempt, won or lost.

> Demo: a live ticker. "Ella tried #30 — lost. Vanessa took #30."

Contention stops being a staged moment and becomes an ambient property of the
app.

**6. Client visibility filter — real row-level security. E.**

Both tables are `public` today, so every client reads every row. CLAUDE.md flags
this as the thing we would say we would fix for production. We could just fix it:

```rust
#[client_visibility_filter]
const CONTACT_FILTER: Filter =
    Filter::Sql("SELECT * FROM pickup_contact WHERE claimed_by = :sender");
```

Put the donor's exact address and phone in a table only the volunteer holding
the claim can see. That is a real requirement — you do not broadcast the
location of unattended food — and it is enforced by the database, not by the
client choosing not to render it. Asked about production readiness, the answer
becomes "already there" instead of "we would add that."

**7. `init` reducer replaces `seed.sh`. E.**

```rust
#[spacetimedb::reducer(init)]
pub fn init(ctx: &ReducerContext) { /* the 15 Baltimore listings */ }
```

The database seeds itself on publish. Kills the bash script, and
`spacetime publish --delete-data=always` gives a fresh board in one command —
which matters when rehearsing the demo repeatedly.

**8. Per-user view for My Pickups. E.**

```rust
#[view(accessor = my_pickups, public)]
fn my_pickups(ctx: &ViewContext) -> Vec<Listing> {
    ctx.db.listing().claimed_by().filter(ctx.sender()).collect()
}
```

Server-computed instead of downloading every row and filtering in React.
Needs `#[index(btree)]` on `claimed_by`, which is worth having anyway.

**9. Scope the subscription itself. V.**

We currently pull every row and filter locally — the naive pattern:

```tsx
useTable(tables.listing)                                     // everything
useTable(tables.listing.where(r => r.completed.eq(false)))   // only what we need
```

Small diff, real depth signal: it shows we understand subscription semantics
rather than treating the database as a table to download.

**10. A second kind of invariant. E.**

"A volunteer may hold at most 3 pickups at once." Another check-then-set, but it
counts rows *inside the transaction* rather than checking one field —
transactional reasoning beyond a single boolean, and a realistic domain rule.

### Why these add up to more than their parts

Land three or four and the pitch changes shape:

> Logic, authorization, scheduling, visibility and broadcast all live **inside
> the database**. Our React client has no business logic in it at all — it
> subscribes and renders.

That is a much stronger "Best Use of SpacetimeDB" claim than one conditional. It
is the difference between using a feature correctly and using the thing as an
application server, which is what it is for.

**Suggested picks if time is short:** 4 (cheap, V, high impact), 5 (the best
demo), 7 (makes rehearsal easy). Leave 6 unless comfortably ahead — it is the
most impressive and the most likely to eat an afternoon.

### Do not build

- Anything else on CLAUDE.md's cut list. It is blunt that nothing else there is
  on-track, and that is right: multi-leg handoffs and the miss heatmap are more
  *product*, not more *SpacetimeDB*.
- Map eye-candy — clustering, custom tiles, animated fly-to. Zero signal here.
- Anything that cannot be finished and demoed in one sitting.

---

## Phase 5 execution — we are doing all of it

Time is not short, so the whole Tier 0 list is in play. That changes the plan in
one important way: **most of these touch the schema, and the schema is frozen.**
Doing them one at a time means regenerating bindings and interrupting V three
separate times. Do them as one migration pass instead.

### Before anything: tag the build that works

```bash
git tag demo-v1 && git push origin demo-v1
```

We have a submittable demo right now. Every schema change from here can break it.
A tag means "go back to the thing that worked" is one command at hour 30, not a
forensic exercise.

Submit this build to Devpost now as well. The risk register is blunt: a late
perfect build scores zero, and Devpost entries can be updated afterwards.

### The schema freeze is being deliberately lifted

PLAN.md froze the schema after Phase 1, and CLAUDE.md says "Two tables. Resist
adding a third." We are going to four. That is a conscious override, not drift —
both files get updated to say so and why, so nobody later reads the rule and
assumes we broke it by accident.

### Order, and why

**1. `init` reducer replaces `seed.sh`.** Do this first, before anything that
changes the schema. It is independent, and it makes every later step easier to
test: `spacetime publish --delete-data=always` gives a clean seeded board in one
command. Rehearsing a demo twenty times against a dirty database is miserable.

**2. One schema pass — all table changes together.** Write these before
republishing or regenerating anything:

- `claim_attempt` event table (item 5). Rows are never stored client-side, only
  `onInsert` fires. `claim_listing` writes one on both paths — won and lost.
- `pickup_contact` table plus the `#[client_visibility_filter]` (item 6).
  Donor address and phone move out of `listing` into a row only the claim holder
  can read.
- `#[index(btree)]` on `listing.claimed_by` (needed by item 8).

Then **one** `spacetime publish`, **one** `spacetime generate`, **one** commit,
**one** message to V. Batching is the whole point.

**3. The `my_pickups` view** (item 8). Needs the index from step 2.

**4. The counting invariant** (item 10) — at most 3 open claims per volunteer.
Counts rows inside the transaction rather than checking one field. Pure reducer
logic, no schema change, so it can land any time after step 2.

### What to watch

- **`claim_attempt` must be written on the losing path too.** The loser's
  transaction returns `Err`, which rolls the transaction back — so verify the
  event row actually survives, and if it does not, say so rather than working
  around it. That finding is itself interesting and belongs in PLAN.md.
- **Moving contact details out of `listing` is a breaking change** for V's
  client. Flag it in the handoff message specifically, not just "schema changed."
- **Four tables needs a line in CLAUDE.md** explaining the override, or the next
  person to read it will think we ignored our own rule.

### Ella's Phase 5 prompt

```
Read CLAUDE.md, PLAN.md and the Phase 5 section of PROMPTS.md first. Phases 0-4
are essentially done: two tables, five reducers, all four screens, the race
proven at the CLI and through the UI. Do not rebuild any of it.

We are deepening our use of the database. The goal is a specific claim:
logic, authorization, scheduling, visibility and broadcast all live inside
SpacetimeDB, and the React client has no business logic in it. Every task
below serves that sentence.

FIRST: `git tag demo-v1 && git push origin demo-v1`. We have a working demo
and everything below can break it.

FILES I OWN: server/** and client/src/module_bindings/ (generated — regenerate,
never hand-edit). In client/ I still own App.tsx, PostForm.tsx, MyPickups.tsx
and my own CSS. I must not edit MapView.tsx, ListingPanel.tsx, Toast.tsx,
NameGate.tsx, ConnectionGate.tsx, listing.ts, pickupWindow.ts or index.css.

TASK 1 — replace server/seed.sh with an #[spacetimedb::reducer(init)] that
seeds the 15 Baltimore listings on publish. Do this before any schema change.
Verify `spacetime publish --delete-data=always` gives a clean seeded board.

TASK 2 — ONE schema pass. Write all of these before republishing:
  (a) a `claim_attempt` event table (listing_id, who, won, at). claim_listing
      writes one on BOTH paths, won and lost. Event table rows are never stored
      in the client cache; only onInsert fires. Check the losing write survives
      the Err rollback and record what you find either way.
  (b) a `pickup_contact` table holding donor address and phone, with a
      #[client_visibility_filter] so only the volunteer holding the claim can
      read it. Move those fields out of `listing`.
  (c) #[index(btree)] on listing.claimed_by.
Then one publish, one generate, one commit, and tell Vanessa — flagging
specifically that contact fields moved out of `listing`, which breaks her
client until she adapts.

TASK 3 — a per-user #[view(accessor = my_pickups, public)] returning listings
claimed by ctx.sender, so My Pickups is server-computed rather than filtered in
React. Needs the index from task 2c.

TASK 4 — an invariant: a volunteer may hold at most 3 open claims. Count rows
inside the transaction. Reducer-only, no schema change.

CONSTRAINTS: ctx.sender is the only trustworthy identity — never take an
Identity as a reducer argument. Reducers stay deterministic: no network, no
filesystem, no wall-clock time, no external RNG; use ctx.timestamp and
ctx.random(). Keep returning Result<(), String> with user-facing copy, and use
try_insert with ? rather than insert when returning Result. We are going from
two tables to four, which overrides CLAUDE.md's "resist a third" — update
CLAUDE.md and PLAN.md to record that override and the schema change, or the
rule will read as broken rather than lifted.
```

## File ownership for Phase 5

Unchanged from Phase 3 except that E now owns the files she created.

| File | Owner |
|---|---|
| `server/**`, `client/src/module_bindings/` | **E** |
| `App.tsx`, `PostForm.tsx`, `MyPickups.tsx` + their CSS | **E** |
| `MapView.tsx`, `ListingPanel.tsx`, `Toast.tsx`, `NameGate.tsx` | **V** |
| `ConnectionGate.tsx`, `listing.ts`, `pickupWindow.ts`, `index.css` | **V** |
| `StressTest.tsx`, `ContentionFeed.tsx` (new) | **V** |

## One interaction between two Phase 5 items — catch it before it bites

**The stress test (item 4) and the max-3-claims invariant (item 10) collide.**

The stress test fires ~50 claims from one browser, so all 50 carry the *same*
`ctx.sender`. That still proves the point — exactly one write succeeds out of 50
concurrent attempts — but two things follow:

1. **The rejection copy reads oddly.** The 49 losers get "Vanessa claimed this
   first," addressed to Vanessa. So the stress test must display a **tally**,
   not the individual messages. `1 of 50 succeeded` is the claim; whose name is
   on it is irrelevant.
2. **Repeated runs hit the 3-claim ceiling.** Each successful run leaves the
   volunteer holding another listing. The stress test should release its claim
   when it finishes, or target a listing someone already holds. Otherwise the
   fourth run fails for a reason that has nothing to do with contention and
   looks like a bug mid-demo.

Worth deciding out loud whether the invariant counts *open* claims only
(completed ones should probably not count against the ceiling).

## Vanessa's Phase 5 prompt

```
Read CLAUDE.md, PLAN.md and the Phase 5 section of PROMPTS.md first. Phases 0-4
are essentially done — do not rebuild anything. Ella is deepening the backend in
one schema pass; some of my work waits on that and some does not.

Work on a branch: `git pull --rebase origin main && git checkout -b feat/phase5`

FILES I OWN: MapView.tsx, ListingPanel.tsx, Toast.tsx, NameGate.tsx,
ConnectionGate.tsx, listing.ts, pickupWindow.ts, index.css, and any new files I
create. I must NOT edit App.tsx, PostForm.tsx, MyPickups.tsx, server/** or
module_bindings/ — those are Ella's.

DO NOW — no dependency on Ella:

TASK 1 — the contention stress test. A deliberate button that fires ~50
claimListing calls at one listing simultaneously via Promise.allSettled, then
shows a TALLY, not the individual messages:
    50 fired · 1 succeeded · 49 rejected · 0 double-claims
All 50 come from my identity, so the rejection copy would read "Vanessa claimed
this first" to Vanessa — which is why it must be a tally. Release the claim when
the run finishes, or repeated runs will hit Ella's 3-claim ceiling and fail for
an unrelated reason. Keep it somewhere a judge can press but nobody hits by
accident.

TASK 2 — scope the subscriptions. We currently pull every row and filter in
React. Move the filter server-side:
    useTable(tables.listing.where(r => r.completed.eq(false)))
Check what this breaks first: if any view needs completed listings, scoping the
shared subscription removes them everywhere. Verify My Pickups still behaves
before pushing, even though that file is Ella's.

TASK 3 — visual work, blocks on nobody. In priority order: the hand-drawn race
diagram (highest value of anything here — it goes at the top of the Devpost),
custom map pins as SVG, a Scraps wordmark, then an empty-state illustration.
Pins go through divIcon's html string, which is NOT escaped — only ever our own
static markup there, never a donor name or description.

AFTER ELLA'S SCHEMA PASS LANDS — she will say so explicitly:

TASK 4 — pull immediately. She is moving donor address and phone OUT of
`listing` into a separate `pickup_contact` table behind a visibility filter.
That is a field removal, so my client will not compile until I adapt. Contact
details should now render only when I hold the claim.

TASK 5 — the contention feed. Her `claim_attempt` event table broadcasts every
claim attempt, won and lost, to every client. Event table rows are never stored
in the client cache — count() is 0 and iter() yields nothing — so this must be
driven by useTable's onInsert callback, NOT by reading rows. A live ticker:
"Ella tried #30 — lost. Vanessa took #30." Cap it at the last handful so it
does not grow without bound.

CONSTRAINTS: no fetch, no polling, no React Query, no Zustand. Never hand-edit
module_bindings. Keep claimed-vs-open obviously distinct at a glance. Run
`npm test` before every push — 24 cases cover the coordinate guard and identity
comparison, and both are load-bearing. Merge to main as soon as each piece
works; do not batch.
```

## V's visual track (runs in parallel, no backend dependency)

Hand-drawn assets are worth real points and block on nobody. In rough order of
value:

**1. The race diagram — highest value of anything in this file.** A drawing of
two clients hitting one reducer, one winning, one getting the rejection.
Judges read a lot of Devposts; a hand-drawn diagram of the actual technical
argument is memorable in a way a screenshot is not. This goes at the top of the
Devpost and can be a slide.

**2. Custom map pins.** Drawn markers instead of coloured circles — a box or
loaf for an open pickup, something visibly different once claimed. Drop them in
as SVG via the existing `divIcon` in `MapView.tsx`. Keep open-vs-claimed
obviously distinct at a glance; watching a pin change is still the demo.

**3. A Scraps wordmark.** Cheap, and makes the header read as a product rather
than a project.

**4. Empty-state illustration.** Nice, low value. Last.

**Rule for pins:** images go through the `divIcon` html string, which is NOT
escaped. Only ever put our own static markup there — never a donor name or
description. See the comment on `pin()` and CLAUDE.md, Security.

## Merge cadence

Both on `main` for phases 0–2, `git pull --rebase origin main` before every push,
push at least hourly. Short-lived feature branches in Phase 3 only. Full rules in
`PLAN.md` under **Git workflow and merge contract**.


---

# PHASE 6 — what each of us owns

Full plan and rationale: `PLAN.md`, "PHASE 6".

## Ella

- [x] Radius filter, server-side — `radius.ts`, `RadiusFilter.tsx`, `YouAreHere.tsx`
- [ ] **Spike the procedure** before building anything: can a `#[procedure]`
      return a value to the client at all? Publish a hello-world one that does
      no HTTP. Stop here if it fails.
- [ ] **Resolve API key storage.** Every public table is world-readable and the
      client bundle is public. If there is no module-level secret mechanism,
      the runtime AI feature is off — say so and stop.
- [ ] Only then: `ask_scraps` procedure, reading listings in a short transaction
      and calling Grok *outside* it.

## Vanessa

- [ ] Rename leftovers in your files: `client/index.html`, `client/README.md`,
      `NameGate.tsx`, `ConnectionGate.tsx`, and the `relay.token` key in
      `main.tsx`. Changing that key gives every browser a fresh identity, so we
      both re-set names once after it lands.
- [ ] `MapView.tsx` now takes a `children` slot — that was E's only change to
      your file, so E's location pin can live inside `<MapContainer>`.
- [x] ~~If the AI spike clears: the ask panel.~~ **Reassigned to E** — V is on
      another feature, so E is building the ask panel. That means E owns
      `AskPanel.tsx` and `AskPanel.css` (both new) on top of `App.tsx`.
      Nothing of V's changes.

## The rule for both

Stop when the next step cannot be finished properly. The build is verified right
now; every item above is optional and none of them is worth breaking it.


---

## Ownership change — the ask panel moved to E

The spike cleared and `ask_scraps` is live, so the panel is being built now
rather than waiting. V was mid-feature, so E took it.

| File | Owner | Note |
|---|---|---|
| `AskPanel.tsx`, `AskPanel.css` | **E** (new) | The assistant UI |
| `App.tsx` | **E** | Mounts it; already E's this phase |
| Everything else in `client/src` | **V** | Untouched by this |

**Design was mocked before it was built**, against the warm-paper tokens — no
new colours, `--open` for the recommendation and `--taken` for failure, the same
`.btn` and hairline treatment as the rest of the panel. It sits at the top of
the existing right panel above the listing detail, always visible rather than
collapsed, because a hidden feature is one a judge never sees.

Three suggestion chips ("something sweet", "what's closest", "expiring soon")
because typing on stage is slow; the free-text input stays for a judge who wants
to ask their own question, which is the better moment anyway.

---

# PHASE 8 — handoff to E, written while the publish is happening

## The one thing that matters

**Publish and generate from `claude/elegant-archimedes-vqqdy1`, not from
`main`.** The merge lives only on that branch. `main` does not contain
`donor_profile`, `listing_photo`, `geocode` or `suggest_description`, so a
publish from `main` changes nothing for V's client — it will still fail to
typecheck with the same ten errors, and it will look like the publish didn't
work.

```bash
git fetch origin
git checkout claude/elegant-archimedes-vqqdy1
git pull

cd server/spacetimedb
spacetime publish food-pickup --yes
spacetime generate --lang typescript --out-dir ../../client/src/module_bindings

cd ../../client && npx tsc -b && npm test && npm run build
```

`tsc` must reach **0 errors**. It is 10 right now and every one is a generated
symbol that does not exist yet. If any survive the generate, stop — pushing
past them means a white screen in the browser, because Vite's dev server does
not typecheck and will happily run code calling a table that is not there.

Then commit the regenerated `module_bindings/` and merge to `main`.

## Two things in E's files changed

1. **`Suggestion` was renamed on V's side, not E's.** Both of us had written a
   struct by that name — E's `{ answer, listing_id, failed }` for the
   assistant, V's `{ ok, text, error }` for the description drafter. They sit
   hundreds of lines apart so git auto-merged them into a file defining the
   name twice. V's is `DescriptionDraft` now. **`ask_scraps` and its
   `Suggestion` are untouched.**
2. **`suggest_description` now reads `xai_model` and `DEFAULT_MODEL`**, the
   same two settings `ask_scraps` uses, instead of hardcoding a model name.
   One key and one model setting serve both features.

`Cargo.toml` had the only real conflict and it was harmless — both of us added
`serde_json`.

## If the publish asks for `--delete-data`

It should not: everything added is a new *table*, and new tables migrate
cleanly. It is new *columns* on existing tables that are unpayable, which is
the trap that cost the `secret` owner column.

But if it comes to that, `--delete-data` **wipes the `secret` table too**, so
both AI features will fail with "No model key is set on this database" — which
reads like a broken feature rather than a missing setting. Recovery:

```bash
spacetime call food-pickup set_secret '"xai_api_key"' '"xai-..."'
spacetime call food-pickup reset_board
```

## First test after it lands

**Post one listing with one photo, before posting several.** `MAX_PHOTO_CHARS`
is 140_000 and it was chosen to be comfortably small, not measured against a
documented row limit — the sandbox had no way to check. If the insert is
rejected, lower it in `lib.rs` *and* `photo.ts` together and drop `MAX_EDGE`
to 480. The client cap must never exceed the module's.

## State of play

| | |
|---|---|
| `main` | Green. 5 tables, 11 reducers, 1 procedure. Demo from here if anything goes wrong. |
| `demo-v1` | Untouched fallback. Do not delete or force-push. |
| `claude/elegant-archimedes-vqqdy1` | Merged. Rust builds for wasm32. 43 tests pass. 10 tsc errors, all pending the generate. |
| Devpost | **Still nothing submitted.** Draft in `docs/DEVPOST.md` is current and paste-ready. |

Devpost is the only item on this page that cannot be recovered from.
