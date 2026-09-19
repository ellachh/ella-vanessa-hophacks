# Scraps — HopHacks Project Brief

> Renamed from *Relay* late on. If you find a stray "Relay", it is a leftover.

> Working title. Change it if you think of something better.
>
> This file is the shared plan for Ella and Vanessa. If you are an AI assistant
> working in this repo, read the whole thing before writing code — especially
> **Scope Discipline** and **Known Traps**.
>
> Task-level breakdown, ownership and sequencing live in `PLAN.md`.

## One-line pitch

A live food-rescue board: restaurants post surplus food, volunteer drivers
claim pickups, and every other volunteer's screen updates instantly so nobody
drives to the same pickup twice.

## Track we are entering

**SpacetimeDB — Best Use of SpacetimeDB.** 1st $500 / 2nd $200 / 3rd $100.

This is our only submission. We are not entering the philanthropy track.

### The stated criterion is POLISH — confirmed from the prize card

> "The SpacetimeDB Prize will be awarded to the team that creates the **most
> polished app** using SpacetimeDB."

The title is *Best Use of SpacetimeDB*; the criterion sentence is *most polished
app*. Both are live and they pull slightly differently, so hold both:

- **Depth is the qualifier.** "Using SpacetimeDB" is doing real work in that
  sentence — a beautiful app that treats it as Postgres will not win the
  SpacetimeDB prize. Our contested-claim argument still carries the pitch.
- **Polish is the bar.** This is not "most technically ambitious". Rough edges,
  broken states and half-finished features count directly against us.

Three consequences, and they override earlier instincts in this file:

1. **A half-built feature is worse than a missing one.** Under a depth
   criterion, an incomplete advanced feature still signals ambition. Under a
   polish criterion it is a visible defect. This settles the Phase 5 question:
   do items in priority order and *stop when the next one cannot be finished
   properly*. Do not commit to a list.
2. **Visual work is not garnish.** V's hand-drawn assets, the empty/loading/
   connection-lost states, and the final visual pass are scoring surface, not
   nice-to-haves.
3. **Finishing beats adding**, every time, from here to submission.

Reasoning: SpacetimeDB is a genuinely niche track — the barrier to entry is real
(unfamiliar database, backend modules in Rust), so few teams will attempt it, and
it has three prize slots instead of one. Every design decision in this file should
be judged by one question: **does this demonstrate deep, correct use of
SpacetimeDB?** Food rescue is the domain we chose because it makes contested
real-time state legible to a judge in ten seconds. It is the setting, not the
point.

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

**Phase 5 shipped beyond this list, deliberately:** scheduled expiry, a
broadcast event table, a server-side view, and a transaction-enforced claim
ceiling. Each was judged against "does this demonstrate deep, correct use of
SpacetimeDB?" and the schema freeze was lifted on purpose. The list below is
what remains cut.

Do not build these unless the core loop is finished, demoed, and stable:

- Multi-leg relay handoffs between volunteers
- A "miss" heatmap of failed rescues
- Real authentication (SpacetimeDB `Identity` is enough)
- Notifications, email, SMS
- ML, route optimization, recommendations
- Mobile apps

These were considered and deliberately cut. A finished simple loop beats a
half-built clever one — and under a *polish* criterion that is not a tiebreaker,
it is the rule.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | SpacetimeDB module in **Rust** | Required by the track |
| Client bindings | `spacetime generate --lang typescript` | Typed, free, no hand-written API layer |
| Client SDK | npm **`spacetimedb`** (not `@clockworklabs/spacetimedb-sdk`) | See Known Traps #2 — the package was renamed |
| UI | React + TypeScript | What we know |
| Map | **Leaflet + OpenStreetMap tiles** | No API key, no signup, no billing page |

Do not use Mapbox or Google Maps. They need tokens and account setup, and that
is 40 minutes we do not have.

## Data model

**Four tables as of Phase 5; seven as of Phase 7.** The original rule here was
"two tables, resist a third". That rule is **deliberately lifted**, not broken: the Phase 5 goal is to
show logic, scheduling, broadcast and server-side views all living inside the
database, and each new table earns its place against that. It is not licence to
keep adding them — `pickup_contact` was designed, attempted and then cut (see
Known Traps #8).

> **Syntax below is corrected against `server/CLAUDE.md`, which is Clockwork's
> own 2.10.1 guidance shipped by `spacetime init`. That file is ground truth for
> module syntax — read it before writing reducers.** Two things it settled that
> this file had wrong: the attribute is `accessor =`, not `name =` (and it is
> `#[spacetimedb::table(...)]`), and `Table` must be in scope or `ctx.db.*.insert()`
> will not compile.

```rust
#[spacetimedb::table(accessor = listing, public)]
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
    #[index(btree)]
    completed: bool,              // indexed — see the note below
}

#[spacetimedb::table(accessor = user, public)]
pub struct User {
    #[primary_key]
    identity: Identity,
    name: String,
}

// Broadcast only. Rows are never stored in the client cache.
#[spacetimedb::table(accessor = claim_attempt, public, event)]
pub struct ClaimAttempt {
    listing_id: u64,
    who: Identity,
    won: bool,
    at: Timestamp,
}

// Drives expire_listings. NOT public — clients see the effects, not the timer.
#[spacetimedb::table(accessor = expiry_tick, scheduled(expire_listings))]
pub struct ExpiryTick {
    #[primary_key] #[auto_inc]
    scheduled_id: u64,
    scheduled_at: ScheduleAt,
}
```

Phase 7 added two more, and **both are tables rather than columns for the same
reason** — trap #9 means a new column on a live table needs a default and an
`Identity` column cannot have one, so extending `listing` or `user` in place
was never available:

```rust
// A restaurant's standing details. Typed once, not once per listing.
#[spacetimedb::table(accessor = donor_profile, public)]
pub struct DonorProfile {
    #[primary_key]
    identity: Identity,
    name: String,
    bio: String,
    address: String,   // free text; lat/lng stay authoritative
    lat: f64,
    lng: f64,
}

// Separate from `listing` because a photo is ~1000x a listing row and every
// client subscribes to the board. Clients subscribe to this scoped to the
// listing they are looking at.
#[spacetimedb::table(accessor = listing_photo, public)]
pub struct ListingPhoto {
    #[primary_key]
    listing_id: u64,
    data_uri: String,  // data:image/jpeg;base64,… capped at 140_000 chars
    posted_by: Identity,
}
```

Plus a per-user view, `#[spacetimedb::view(accessor = my_pickups, public)]`,
returning the listings `ctx.sender()` currently holds — server-computed rather
than filtered in React.

**The radius filter is a subscription, not a list filter.** `client/src/radius.ts`
builds the query with `.gte()`/`.lte()` on `lat` and `lng`, so narrowing the
radius narrows what the server sends. It is a bounding *box* because the query
builder compares columns to literals and has no trigonometry; `withinRadius`
trims the box corners to a true circle over the handful of rows that survive.
The count reads "7 pickups" rather than "7 of 15" on purpose — the rows outside
the radius were never sent, so the total is not knowable without subscribing to
everything, which is the thing being avoided.

Deliberate choices:

- **No status enum.** `claimed_by.is_none()` means open; `completed` closes it.
  An enum means more Rust for no gain.
- **The `user` table exists only for display names**, so the UI shows "Vanessa"
  instead of a hex identity. It matters more in a demo than it sounds.
- **`claim_attempt` is an `event` table** (`#[spacetimedb::table(..., event)]`).
  Rows are broadcast and never stored in the client cache — `count()` is 0,
  `iter()` yields nothing, only `onInsert` fires. Right for something transient
  like an attempt.
- **`expiry_tick` is a scheduled table**, not `public`. Inserting a row schedules
  `expire_listings`. No client needs to see the timer, only its effects.
- **`completed` is indexed, `claimed_by` is not.** `claimed_by` is the natural
  key for "my pickups", but an `Option` column cannot be an index-filter
  argument in 2.10.1, and a `#[view]` may only start from an index — it cannot
  call `iter()`. So `my_pickups` starts from the open listings and narrows to
  `ctx.sender()` in Rust.

## Reducers — ten, in three groups

**The loop** — everything a volunteer does:

| Reducer | Behavior |
|---|---|
| `set_name(name)` | Upsert `user` row for `ctx.sender` |
| `post_listing(donor, description, pickup_by, lat, lng)` | Validates, then inserts with `posted_by = ctx.sender`, `claimed_by = None` |
| `claim_listing(id)` | **If `claimed_by` is None**, set to `ctx.sender`. Otherwise `Err`. Also enforces the 3-open-claim ceiling and writes a `claim_attempt`. |
| `unclaim_listing(id)` | Only if `claimed_by == ctx.sender` |
| `complete_listing(id)` | Only if `claimed_by == ctx.sender`; sets `completed = true` |

**Scheduled** — the database calling our code with no client involved:

| Reducer | Behavior |
|---|---|
| `expire_listings(tick)` | Every 30s: deletes listings past `pickup_by` **that nobody claimed**. Claimed ones are left alone — a volunteer may be en route past the window. |

**Donor-side** — added in Phase 7:

| Reducer | Behavior |
|---|---|
| `save_donor_profile(name, bio, address, lat, lng)` | Upsert `donor_profile` for `ctx.sender`. Identity is never a parameter. |
| `post_listing_with_photo(donor, description, pickup_by, lat, lng, photo)` | Listing and photo in one transaction. Empty `photo` means none. `post_listing` is unchanged. |
| `attach_photo(listing_id, data_uri)` | Only if `listing.posted_by == ctx.sender` |
| `remove_photo(listing_id)` | Only if `photo.posted_by == ctx.sender` |

**Procedures** — the database calling *out*:

| Procedure | Behavior |
|---|---|
| `geocode(address)` | OpenStreetMap lookup. Runs here because Nominatim's policy wants a descriptive `User-Agent` and a browser cannot set one — see trap #11. |
| `suggest_description(donor, note)` | Grok drafts a listing description. Key read from the private `secret` table. |

Both return a struct carrying either a result or a sentence to show. Neither
panics, and neither is load-bearing: if the model or the geocoder is down, the
donor types the description and drops the pin by hand, exactly as before.

**Operational** — because `init` only fires on a fresh database (trap #9):

| Reducer | Behavior |
|---|---|
| `init()` | Fresh DB only: arms the expiry ticker and seeds the board |
| `arm_expiry()` | Arms the ticker on a live DB. Idempotent. |
| `seed_board()` | Seeds a live DB. No-ops if any listing exists. |
| `reset_board()` | **Wipes and re-seeds** with windows measured from now. Run before every rehearsal — `seed_board` cannot refill a board that expiry has left fully claimed. |

All five loop reducers return `Result<(), String>`, and those strings are
user-facing demo copy — they get read aloud. `claim_listing`'s rejection is
`"<name> claimed this first."`, resolved from the `user` table.

The conditional in `claim_listing` is the project's technical centerpiece. Do not
"simplify" it into an unconditional write.

## Security — what actually protects this

Reviewed at Phase 1. No secrets in the repo or its history, no vulnerable
dependencies. The real surface is the data model, and it rests on three things:

1. **Any connected client can call any reducer.** That is the SpacetimeDB model,
   not a flaw — the *conditionals inside the reducers are the access control*.
   `unclaim_listing` and `complete_listing` must verify
   `claimed_by == ctx.sender` before writing. Drop those checks and anyone can
   complete or release someone else's pickup. `claim_listing`'s `is_none()` test
   is the same kind of guard doing double duty as the race resolver.
2. **`ctx.sender` is the only trustworthy identity.** Never accept an `Identity`
   as a reducer argument and act on it — a client can pass any value it likes.
   The template's guidance states this first and in bold.
**Row-level security is NOT available on 2.10.1 — do not claim it.**
`#[client_visibility_filter]` exists and compiles, but it sits behind the
crate's unstable feature and the crate itself carries
`// TODO: RLS filters are currently unimplemented, and are not enforced`. It
publishes and enforces nothing. We planned a `pickup_contact` table behind such
a filter and cut it on finding this. Saying "we used row-level security" to a
Clockwork judge would be wrong about their own product, in front of the people
who wrote it — so the honest line is point 3 below: everything public is
world-readable, and here is what we would do about it in production.

3. **`public` means world-readable.** `listing`, `user` and `claim_attempt` are `public`, so every client
   can read every row — including `user`, which maps Identity to a real name.
   Writes still require reducers, so this is read-only exposure. Correct for a
   public board and fine for the demo; worth saying out loud if a judge asks
   what you would change for production.

### Accounts and login — asked again, still no

Revisited in Phase 5 and the cut stands. The reasoning, because it is also the
answer to give a judge:

**We already have authentication.** SpacetimeDB issues every client a
cryptographic `Identity`, and `ctx.sender` is the authenticated principal that a
client cannot forge. That is not a placeholder for real auth — it is real auth,
just anonymous. Our entire authorization model rests on it.

**A login demonstrates nothing distinctive.** SpacetimeDB does support OIDC
(SpacetimeAuth, Auth0, Clerk, Google, GitHub), so wiring it up would technically
be "using a feature" — but every backend has that feature. Our authorization is
already enforced where it counts: inside the reducers, against `ctx.sender`.

**It would make the demo worse.** The pitch is ten seconds — two laptops, both
tap, one wins. "Now we both sign up" is friction in front of the thing being
judged. `NameGate` already solves the only real problem, which is that the board
needs a human-readable name.

**Known rough edge, and it is not solved by accounts:** identity lives in a
`localStorage` token. Clear site data or use a fresh incognito window and you are
a different volunteer, with no name and no claims. Fine for a demo; do not clear
storage between rehearsals.

**Photos are the only non-text thing on the board**, and they arrive from
anonymous clients like everything else. They are checked twice against the same
three `data:image/...;base64,` prefixes — `check_photo` in the module and
`isSafePhotoSrc` in the client — before one reaches an `<img src>`. Neither
check is the only one. An `<img>` does not execute script even for an SVG
payload, but "user data never reaches an unescaped sink" covers `src` as much
as `innerHTML`, and the test is two string comparisons.

**Client-side, one concrete trap:** Leaflet's `bindPopup()` takes an HTML string
and does not escape it. Listing text is free-form input from any anonymous
client, so building popups that way is stored XSS. Use react-leaflet's `<Popup>`
with JSX children — React escapes those — and never interpolate `description` or
`donor` into an HTML string.

## Client architecture

The TypeScript SDK ships first-party React bindings. Wrap the app in
`SpacetimeDBProvider`, then read tables through `useTable`:

```tsx
const [listings, ready] = useTable(tables.listing)
const claim = useReducer(reducers.claimListing)
```

`useTable` **is** the subscription — it returns live rows and re-renders on every
change. There are no SQL strings in the 2.x client API: `tables.listing` is a
query builder, and filtering happens server-side via
`tables.listing.where(r => r.completed.eq(false))`. Earlier drafts of this file
said to subscribe to `SELECT * FROM listing`; that was the 1.x API.

Connection state (`isActive`, `identity`, `connectionError`) comes from
`useSpacetimeDB()`. `SpacetimeDBProvider` takes the connection *builder*, not a
built connection — do not call `.build()` yourself.

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
2. **The TypeScript SDK package was renamed.** It is now plain **`spacetimedb`**
   (2.10.1 as of Phase 1), not `@clockworklabs/spacetimedb-sdk`. The old name
   still resolves on npm, but its last release (2.0.0) is a stub whose only
   dependency is `spacetimedb@next` — a dist-tag that does not exist — so
   installing the old name fails outright with `ETARGET`. Every tutorial you
   will find still uses the old name.
3. **E's CLI version and V's SDK version must match.** `spacetime generate`
   emits bindings that import from whichever package name and API shape that CLI
   targets. If E's CLI is 1.x, the generated bindings will not line up with
   `spacetimedb@2.10.1` and the client will not compile. Check this at the
   handoff, before debugging anything else.
4. **Module language support:** the `spacetimedb` package ships a
   `spacetimedb/server` export, described as "API and ABI bindings for the
   SpacetimeDB TypeScript module library" — which suggests modules can now be
   written in TypeScript, not only Rust. Unverified: we have no `spacetime` CLI
   in hand to publish one. Flagged for E to check; we are still on Rust, and
   150 lines of Rust is not the risk here.
5. **Leaflet needs its CSS imported** or the map renders as a broken grey box.
6. **Leaflet's default marker icon breaks in the production build — and only
   there.** Leaflet locates its marker PNGs at runtime by reading the
   `background-image` of `.leaflet-default-icon-path` and stripping
   `marker-icon.png` off the end. Vite inlines those PNGs as base64 `data:`
   URIs, so that strip finds nothing and every `<Marker>` requests a bare
   `marker-icon.png` that does not exist. `npm run dev` serves the stylesheet
   unhashed and looks perfect, so this surfaces only after `npm run build` —
   and without a 404 to notice, because the static server answers unknown paths
   with `index.html` and a 200. Fixed in `client/src/leaflet-default-icon.ts`,
   imported by `MapView`. Verified in a real browser, before and after.
7. Seed 10–15 realistic listings early. A demo with two rows on the map looks
   like a prototype; fifteen looks like a product. Seeding is now the `init`
   reducer, not a shell script — `server/seed.sh` is gone.
8. **Row-level security does not work on 2.10.1. Do not claim it.**
   `#[client_visibility_filter]` exists only behind the crate's `unstable`
   feature, and the crate itself says:

   ```rust
   // TODO: RLS filters are currently unimplemented, and are not enforced.
   ```

   It compiles, it publishes, and it enforces nothing — every client still
   receives every row. A planned `pickup_contact` table holding donor address
   and phone was cut for exactly this reason: shipping it would have meant
   claiming row-level security in the pitch while having none. **Both tables
   being `public` means genuinely world-readable; never put anything sensitive
   in them.**
9. **Adding a column to a table that already exists needs `#[default(...)]`.**
   Publishing fails with *"Adding a column X to table Y requires a default value
   annotation"*, and the only way past it is `--delete-data`, which wipes
   everything. There is no meaningful default for an `Identity`, so a column of
   that type cannot be added to a live table at all. **Design tables before the
   first publish, or accept the field is not gettable without a data wipe.**
   New *tables* migrate fine; new *columns* on old tables do not.
10. **`init` only fires on a fresh database.** Republishing over an existing one
   runs neither the seed nor the expiry timer. `seed_board` and `arm_expiry`
   exist to do each on a live database without `--delete-data=always`. Both are
   idempotent.

11. **A browser cannot set `User-Agent` on `fetch`.** It is on the forbidden
   header list and is dropped silently — no error, no warning. OpenStreetMap's
   Nominatim asks callers to identify themselves that way, so a browser-side
   geocode cannot comply with their policy no matter how it is written. The
   `geocode` procedure exists because of this: a module *can* set the header.
   This is the cleanest example in the project of logic living in the database
   because it has to, not because it reads well.

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
| 28 – 32 | Demo rehearsal, Devpost writeup, submit to the SpacetimeDB track |
| 32+ | Buffer. Something will break. |

### The bail-out rule

If hour 1.5 arrives and nothing syncs, **abandon SpacetimeDB** and pivot to the
memetics track or the marimo data-viz track, both pure Python/TS. Set a real
alarm. The failure mode is not that SpacetimeDB is too hard — it is spending
twelve hours refusing to admit the toolchain is not cooperating.

## Demo script

**The full script, with the setup checklist and prepared answers, is
`docs/DEMO.md`.** The beats:

1. Two laptops side by side, both showing the map.
2. Ella posts a listing. It appears on Vanessa's screen instantly, untouched.
3. **Both tap claim on the same listing at the same moment.** One wins, one sees
   it grey out. Explain the serialized-transaction argument here.
4. Winner marks it complete; it clears from both boards.
5. Close on the technical argument, not the mission. The domain makes the demo
   legible; the reason to care is that contested claims, live subscriptions and
   authoritative server logic are what SpacetimeDB is *for*, and we used it that
   way instead of as a Postgres substitute.

## Scope discipline (for both of us, and for any AI assistant in this repo)

- Do not add features not listed in **Scope**. Suggest them, do not build them.
- Keep the Rust module minimal. Every line of Rust is risk.
- Prefer finishing the loop over polishing any single screen.
- If something in this file turns out to be wrong (wrong API, wrong assumption),
  fix the file as well as the code so we stay in sync.
