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

## Handoff points

Three moments where you must talk to each other out loud. Everything else can
happen in parallel.

| When | Who | What |
|---|---|---|
| End of Phase 1 | E → V | "Bindings are committed and pushed, pull now." V is blocked until this happens. |
| Any schema change | E → V | "I changed the schema, regenerated, pushed. Pull before you do anything else." |
| Start of Phase 3 | E ↔ V | Agree out loud which `client/` files E is taking, so you are not in the same component. |

## Merge cadence

Both on `main` for phases 0–2, `git pull --rebase origin main` before every push,
push at least hourly. Short-lived feature branches in Phase 3 only. Full rules in
`PLAN.md` under **Git workflow and merge contract**.
