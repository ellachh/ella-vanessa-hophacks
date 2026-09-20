# Scraps

**A live food-rescue board for Baltimore, built on SpacetimeDB.**

Stores post surplus food. Users claim pickups on a map. Every other screen
updates instantly — and when two people tap the same pickup at the same instant,
exactly one of them wins.

> Built at HopHacks 2026 for the **Best Use of SpacetimeDB** track.
> Ella Chen and Vanessa Ching.

---

## The one thing worth knowing

Two volunteers claiming the same pickup at the same moment is a **contested
claim**. In a normal stack both requests read "unclaimed" before either writes,
both writes land, and two drivers get sent for one tray of bagels. You fix it
with row locks, a version column, or a compare-and-swap retry loop.

In SpacetimeDB, our code runs *inside* the database and reducers are serialized
transactions. `claim_listing` checks whether the pickup is unclaimed and, if it
is, writes. The second transaction cannot see the state the first one saw.

**We wrote no locking code.** Fifty concurrent claims fired at one listing:

```
50 fired · 1 succeeded · 49 rejected · 85ms
```

It's a button in the app — anyone can press it.

## Running it

```bash
# The module
cd server
spacetime publish food-pickup --yes
spacetime generate --lang typescript --out-dir ../client/src/module_bindings

# The client
cd ../client
npm install
npm run dev
```

The assistant needs a key, stored in a **private** table that no client can read:

```bash
spacetime call food-pickup set_secret '"xai_api_key"' '"xai-..."'
spacetime call food-pickup arm_expiry      # init only fires on a fresh database
spacetime call food-pickup reset_board     # fifteen pickups, windows from now
```

## What's in here

| Path | What |
|---|---|
| `server/spacetimedb/src/lib.rs` | The whole backend — 8 tables, 17 reducers, 3 procedures, 1 view |
| `client/src/` | React + TypeScript. Two `useTable` calls are the entire data layer. |
| `client/src/module_bindings/` | **Generated** by `spacetime generate`. Never hand-edit. |
| `tools/` | Build-time only. Nothing here runs in the app. |
| `docs/` | Project brief, plans, demo script, and the write-up |

## Using the database as a database

| Feature | Mechanism |
|---|---|
| One winner under contention | Reducers are serialized transactions |
| Pickups expiring unattended | Scheduled table |
| Claims broadcast, never stored | Event table |
| "Your pickups" computed server-side | `#[view]` |
| Travel radius | A scoped subscription — a query, not a list filter |
| At most 3 open claims | Counted **inside** the transaction |
| Calling a language model and a geocoder | Procedures |

There is **no data-fetching code in this client**. No fetch, no polling, no
cache, no invalidation. Rows change on the server, the subscription fires, React
re-renders.

### The AI runs inside the database

`ask_scraps` is a `#[procedure]`, not a reducer: it reads the open board in a
short transaction, closes it, then makes an outbound HTTPS call to xAI. The
browser never talks to the model.

That distinction is the point. **Reducers must be deterministic** — no network,
no clock — and that is the same all-or-nothing property that makes the contested
claim correct. Procedures exist for the work reducers must refuse.

## Two things this project does not do

- **No row-level security.** `#[client_visibility_filter]` exists on 2.10.1 but
  sits behind an `unstable` feature and the crate states it is not enforced. We
  cut a private contact table rather than claim security we did not have. Every
  `public` table here is genuinely world-readable.
- **No accounts.** SpacetimeDB issues each client a cryptographic `Identity` and
  `ctx.sender` is an authenticated principal a client cannot forge. That is real
  authentication, just anonymous, and every authorization check rests on it.

## Docs

| File | For |
|---|---|
| [`docs/CLAUDE.md`](docs/CLAUDE.md) | The project brief — scope, data model, and every trap we hit |
| [`docs/DEMO.md`](docs/DEMO.md) | The three-minute demo script |
| [`docs/CHEATSHEET.md`](docs/CHEATSHEET.md) | Questions a judge is likely to ask, with answers |
| [`docs/CHECKLIST.md`](docs/CHECKLIST.md) | Pre-demo verification, every feature |
| [`docs/DEVPOST.md`](docs/DEVPOST.md) | The submission write-up |
| [`docs/PLAN.md`](docs/PLAN.md) · [`docs/PROMPTS.md`](docs/PROMPTS.md) | How we split the work |
| [`docs/why-spacetimedb.html`](docs/why-spacetimedb.html) | The contested claim traced against a REST equivalent |

**Working here with an AI assistant?** Read `docs/CLAUDE.md` first, and
`server/CLAUDE.md` — Clockwork's own guidance, shipped by `spacetime init` — for
anything about module syntax. It outranks our notes and it is version-matched.
Three rules that are easy to break by accident:

1. Do not describe this project as having row-level security.
2. Do not "simplify" the conditional in `claim_listing`. It is the whole point.
3. `client/src/module_bindings/` is generated. Regenerate it; never edit it.
