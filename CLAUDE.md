# Relay — HopHacks Project Brief

> Working title. Change it if you think of something better.
>
> This file is the shared plan for Ella and Vanessa. If you are an AI assistant
> working in this repo, read the whole thing before writing code — especially
> **Scope Discipline** and **Known Traps**.

## One-line pitch

A live food-rescue board: restaurants post surplus food, volunteer drivers
claim pickups, and every other volunteer's screen updates instantly so nobody
drives to the same pickup twice.

## Tracks we are entering

We submit **one project to two tracks**:

1. **SpacetimeDB — Best Use of SpacetimeDB** (primary). 1st $500 / 2nd $200 / 3rd $100.
2. **Bloomberg — Most Philanthropic Hack** (secondary). 1st: Beats headphones.

Reasoning: SpacetimeDB is a genuinely niche track — the barrier to entry is real
(unfamiliar database, backend modules in Rust), so few teams will attempt it, and
it has three prize slots. Philanthropy is the opposite: zero barrier to entry, so
it is one of the most crowded tracks at any hackathon, and it pays out only to
1st. Building for SpacetimeDB and submitting to philanthropy as a second entry
costs us nothing extra and gives us the thin track as our real bet.

Confirm at the opening ceremony that HopHacks allows one project in multiple
tracks. It almost always does, but verify.

## Why SpacetimeDB actually fits (this is the pitch)

SpacetimeDB is not "a database with websockets." Its distinguishing property is
that **application logic lives inside the database** — you upload WASM modules,
clients subscribe to SQL queries, and the DB pushes changes. It was built by
Clockwork Labs to run MMO world state.

Our technical argument in one sentence:

> Two volunteers tapping the same pickup at the same instant is a contested-claim
> race. Reducers run as serialized transactions, so a check-then-set inside
> `claim_listing` resolves that race atomically with no locking code from us.

That is the thing to say to the Clockwork judges, and the thing to *demo* —
two laptops, both tap the same listing simultaneously, one wins.

## Scope — build exactly this

Four screens, one loop:

1. **Post** — a donor posts surplus food: description, pickup-by time, location.
2. **Map** — volunteers see open listings on a map.
3. **Claim** — a volunteer claims one; it greys out on everyone else's screen instantly.
4. **My pickups** — a volunteer sees what they've claimed, can unclaim or mark complete.

That is the entire product.

### Explicitly NOT in scope

Do not build these unless the core loop is finished, demoed, and stable:

- Decay timers / scheduled reducers
- Multi-leg relay handoffs between volunteers
- A "miss" heatmap of failed rescues
- Real authentication (SpacetimeDB `Identity` is enough)
- Notifications, email, SMS
- ML, route optimization, recommendations
- Mobile apps

These were considered and deliberately cut. A finished simple loop beats a
half-built clever one. If we are comfortably ahead at hour 20, the miss-heatmap
is the first thing to add back, because it is cheap and it strengthens the
philanthropy submission.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | SpacetimeDB module in **Rust** | Required by the track |
| Client bindings | `spacetime generate --lang typescript` | Typed, free, no hand-written API layer |
| UI | React + TypeScript | What we know |
| Map | **Leaflet + OpenStreetMap tiles** | No API key, no signup, no billing page |

Do not use Mapbox or Google Maps. They need tokens and account setup, and that
is 40 minutes we do not have.

## Data model

Two tables. Resist adding a third.

```rust
#[table(name = listing, public)]
pub struct Listing {
    #[primary_key] #[auto_inc]
    id: u64,
    donor: String,                // "Sally's Bakery"
    description: String,          // "~20 bagels, day-old"
    pickup_by: Timestamp,
    lat: f64,
    lng: f64,
    posted_by: Identity,
    claimed_by: Option<Identity>, // None = still open
    completed: bool,
}

#[table(name = user, public)]
pub struct User {
    #[primary_key]
    identity: Identity,
    name: String,
}
```

Deliberate choices:

- **No status enum.** `claimed_by.is_none()` means open; `completed` closes it.
  An enum means more Rust for no gain.
- **The `user` table exists only for display names**, so the UI shows "Vanessa"
  instead of a hex identity. It matters more in a demo than it sounds.

## Reducers (the whole backend — five functions)

| Reducer | Behavior |
|---|---|
| `set_name(name)` | Upsert `user` row for `ctx.sender` |
| `post_listing(donor, description, pickup_by, lat, lng)` | Insert with `posted_by = ctx.sender`, `claimed_by = None` |
| `claim_listing(id)` | **If `claimed_by` is None**, set to `ctx.sender`. Otherwise no-op. |
| `unclaim_listing(id)` | Only if `claimed_by == ctx.sender`; set back to `None` |
| `complete_listing(id)` | Only if `claimed_by == ctx.sender`; set `completed = true` |

The conditional in `claim_listing` is the project's technical centerpiece. Do not
"simplify" it into an unconditional write.

## Client architecture

Subscribe to `SELECT * FROM listing` and `SELECT * FROM user`, then render
directly from the subscription.

No fetch calls. No polling. No Redux/Zustand/React Query. Rows change, the
subscription fires, React re-renders. If you find yourself writing data-fetching
code, you have misunderstood the database — stop and re-read the client SDK docs.

## Neither of us knows Rust

That is fine and it is planned for. SpacetimeDB modules are not general Rust
programs — you write struct definitions with attribute macros and small functions
that mutate tables. No async, no traits, no lifetimes, no `Arc<Mutex<>>`. The
hard parts of Rust do not appear. Roughly 150 lines total.

All genuinely interesting client work happens in TypeScript.

## Known traps

1. **The macro API has changed across SpacetimeDB versions.** The Rust snippets
   in this file are *shape, not gospel*. Copy exact spelling from the current
   official quickstart. Do not trust blog posts, Stack Overflow, older tutorials,
   or an AI assistant's memory — stale examples are the single most likely way to
   lose four hours.
2. **Verify current module language support** at the docs when the event opens.
3. **Leaflet needs its CSS imported** or the map renders as a broken grey box.
4. Seed 10–15 realistic listings early. A demo with two rows on the map looks
   like a prototype; fifteen looks like a product.

## Pre-hackathon setup (do this before the clock starts)

On **both** laptops:

1. Install the Rust toolchain and the `spacetime` CLI
2. Run the official SpacetimeDB quickstart end to end — module published locally,
   client receiving one live update
3. Delete it

Confirm HopHacks' rules first. Tooling setup and learning are near-universally
allowed; pre-written project code is not.

## Timeline

| Hours | Goal |
|---|---|
| 0 – 1.5 | **HARD CHECKPOINT.** Hello-world module published, TS client receiving one live update. |
| 1.5 – 5 | Real schema + all five reducers, tested from the CLI |
| 5 – 20 | React client: map, post form, claim flow, my-pickups |
| 20 – 28 | Two-device sync polish, seed data, visual cleanup |
| 28 – 32 | Demo rehearsal, Devpost writeup, submit to **both** tracks |
| 32+ | Buffer. Something will break. |

### The bail-out rule

If hour 1.5 arrives and nothing syncs, **abandon SpacetimeDB** and pivot to the
memetics track or the marimo data-viz track, both pure Python/TS. Set a real
alarm. The failure mode is not that SpacetimeDB is too hard — it is spending
twelve hours refusing to admit the toolchain is not cooperating.

## Demo script

1. Two laptops side by side, both showing the map.
2. Ella posts a listing. It appears on Vanessa's screen instantly, untouched.
3. **Both tap claim on the same listing at the same moment.** One wins, one sees
   it grey out. Explain the serialized-transaction argument here.
4. Winner marks it complete; it clears from both boards.
5. Close on the philanthropy framing: food dies twenty minutes from someone who
   needs it, and the gap is a coordination problem, not a supply problem.

## Scope discipline (for both of us, and for any AI assistant in this repo)

- Do not add features not listed in **Scope**. Suggest them, do not build them.
- Keep the Rust module minimal. Every line of Rust is risk.
- Prefer finishing the loop over polishing any single screen.
- If something in this file turns out to be wrong (wrong API, wrong assumption),
  fix the file as well as the code so we stay in sync.
