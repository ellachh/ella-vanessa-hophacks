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

## Merge cadence

Both on `main` for phases 0–2, `git pull --rebase origin main` before every push,
push at least hourly. Short-lived feature branches in Phase 3 only. Full rules in
`PLAN.md` under **Git workflow and merge contract**.
