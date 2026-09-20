# Devpost submission — paste-ready

Two fields. Copy each block verbatim.

---

# FIELD 1 — Elevator pitch

> A live food-rescue board for Baltimore where two people can never claim the
> same pickup — because the database, not our code, decides who wins.

*(Alternates, if the field is longer than expected:)*

> Stores post surplus food, users claim it on a live map. When two people tap
> the same pickup in the same instant, exactly one wins — no locking code, no
> retries. Built on SpacetimeDB, where our logic runs inside the database.

---

# FIELD 2 — About the project

*Everything below is Markdown. Paste as-is.*

---

## Inspiration

Food gets thrown out twenty minutes from someone who needs it, and the reason
usually isn't supply — it's coordination. Two volunteers drive to the same
restaurant. A third pickup expires because nobody knew it existed.

That failure has a name in computing: a **contested claim**. Two people acting
on the same stale view of shared state. We wanted to build the version where it
cannot happen — and once we started, the interesting part turned out not to be
the app at all. It was what a database does when two people tap at the same
instant.

## What it does

**Scraps** is a live food-rescue board for Baltimore.

Stores post surplus food with a photo, a pickup window and a location. Users see
it on a map and claim what they can collect. Every other screen updates
instantly — no refresh, no polling, no reload button anywhere in the product.

- **Two people tap Claim on the same pickup at the same moment → exactly one
  wins.** The other is told who beat them, by name.
- **Unclaimed pickups delete themselves** when their window passes, on a timer
  running inside the database with no client involved.
- **Ask Scraps** answers questions in plain language — *"something sweet"*,
  *"what's closest"*, *"anything expiring soon"* — grounded in the pickups
  actually on the board and how far each one is from you.
- **Photograph the food and the description writes itself**, because the model
  reads the picture.
- **Set how far you'll travel** and the board narrows — not by filtering a list,
  but by changing what the server sends you.

## How we built it

**SpacetimeDB 2.10.1.** It isn't a database you put behind a server — it's a
database you put your server *inside*. Our application logic compiles to
WebAssembly and runs in the database; clients subscribe to queries and the
database pushes changes to them.

- **Backend:** one Rust module. 8 tables, 17 reducers, 3 procedures, 1 view.
- **Frontend:** React + TypeScript, Leaflet + OpenStreetMap.
- **Data layer:** two `useTable` calls. That is the entire thing. **There is no
  data-fetching code anywhere in this client** — no fetch, no polling, no cache,
  no invalidation.

Neither of us had written Rust before this weekend. It turned out to matter less
than we expected: a SpacetimeDB module is table structs and small mutation
functions. No async, no lifetimes, no `Arc<Mutex<>>`. The hard parts of Rust
never appeared.

### Using the database as a database, not as storage

| Feature | Mechanism |
|---|---|
| One winner under contention | Reducers are serialized transactions |
| Pickups expiring with nobody watching | Scheduled table |
| Claims broadcast but never stored | Event table |
| "Your pickups" computed server-side | `#[view]` |
| Travel radius | A scoped subscription — a query, not a filter |
| At most 3 open claims per user | Counted **inside** the transaction |
| Calling a language model and a geocoder | Procedures |

### The AI runs inside the database

`ask_scraps` is a `#[procedure]`, not a reducer. It opens a short transaction to
read the open board and an API key, **closes it**, and only then makes an
outbound HTTPS request to xAI's Grok. The browser never talks to the model — it
asks the database, and the database calls out.

That isn't a design flourish. **A reducer cannot do this, and should not.**
Reducers must be deterministic — no network, no clock, no filesystem — and that
is the *same* all-or-nothing property that makes two simultaneous claims resolve
to exactly one winner. A reducer that could call an API could not offer that
guarantee. Procedures exist for precisely the work reducers must refuse.

The API key lives in a private table. Private means no client can read it, and
the code generator skips the table entirely — it prints
`Skipping private tables during codegen: expiry_tick, secret` on every publish.
Nothing secret reaches the browser bundle.

The model only ever sees pickups that exist, with their real distances and real
time remaining, and any listing id it returns is discarded unless it was in the
list we supplied. It cannot recommend something it invented.

## Challenges we ran into

**The transaction boundary ate a feature.** We added an event table to broadcast
every claim attempt, won and lost, so contention would be visible to everyone
rather than only to the loser. We wrote a comment predicting the losing write
might not survive — then tested it against the live database. Exactly one row
arrived: `won: true`.

A reducer returning `Err` aborts its entire transaction, and the insert goes with
it. **The property that killed the feature is the same guarantee that makes the
claim correct.** We could get the losses back by always returning `Ok` and
putting the outcome in the row, but that costs the rejection message on the
loser's screen — the clearest thing in the whole demo. We kept the guarantee and
dropped the feature.

**Row-level security doesn't exist yet.** We planned a private table for store
contact details behind `#[client_visibility_filter]`. It compiles. It publishes.
Reading the crate source, it sits behind an `unstable` feature and carries
`// TODO: RLS filters are currently unimplemented, and are not enforced`. We cut
the table rather than ship a security claim with nothing behind it.

**A browser cannot set `User-Agent`.** It's a forbidden header, dropped
silently, no error. OpenStreetMap's Nominatim asks callers to identify
themselves that way — so a browser-side geocode *cannot* comply, however it's
written. A module can. That is the cleanest example in this project of logic
living in the database because it has to, not because it reads well.

**Our own scheduled reducer ate the demo board overnight.** We came back to six
listings, all claimed — every unclaimed one had passed its pickup window and
been deleted, exactly as designed. Correct behaviour, genuinely alarming at 3am.
It is also the best evidence we have that the timer works, because nobody staged
it.

**Every SpacetimeDB example we found online was wrong.** The macro API moved
between versions, and the npm package was renamed — the old name still resolves,
but its final release is a stub depending on a dist-tag that doesn't exist, so
installing it fails outright. The guidance shipped inside the template was the
only source that matched the version we were on.

## Accomplishments we're proud of

**We wrote no locking code.** No `SELECT … FOR UPDATE`, no compare-and-swap, no
retry loop, no version column. The contested claim is a four-line check-then-set
that is correct because reducers are serialized transactions.

And we proved it rather than asserting it. Fifty concurrent claims fired at one
listing from a single browser:

> **50 fired · 1 succeeded · 49 rejected · 85ms**

It's a button in the app, so a judge can press it themselves — and the database's
own log shows one `claim ACCEPTED` and forty-nine `claim REJECTED`, streaming
from the server while it happens.

We're also proud of three features we **deleted**: row-level security, the
loss-broadcast, and a private contact table. Under a judging criterion that
reads *most polished*, a half-built feature is a visible defect rather than
evidence of ambition.

## What we learned

The big one was about where correctness lives. In a normal stack, "two people
can't claim the same thing" is something you remember to implement. Here it's a
property of the execution model, and the work is understanding that model rather
than defending against it.

The smaller one: **test the thing you're about to claim.** Our best story this
weekend — the event-table rollback — came from writing down a prediction and
then checking it, and getting an answer that closed off a feature we'd already
built.

## What's next

- **Row-level security**, when it lands. Every table we have is world-readable,
  which is right for a public board and wrong for the contact details a real
  deployment needs.
- **Presence.** `client_connected` and `client_disconnected` are first-class
  lifecycle reducers, so showing who's online is nearly free.
- **Per-listing presence** — seeing that someone else is looking at the pickup
  you're about to claim, *before* either of you taps. That's the MMO use case
  SpacetimeDB was built for, in miniature.

## Built with

`rust` · `spacetimedb` · `webassembly` · `typescript` · `react` · `vite` ·
`leaflet` · `openstreetmap` · `grok` · `xai` · `netlify`

---

## Before you submit

- [ ] Screenshots: the full board, the rejection toast mid-race, the stress-test
      tally, a listing with a photo
- [ ] The Netlify link
- [ ] The repo link
- [ ] Track: **SpacetimeDB — Best Use of SpacetimeDB**
- [ ] A demo video, **if HopHacks requires one** — check the rules
