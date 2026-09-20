# Cheat sheet

Skim this before judging. Everything here is a question a judge is likely to
ask, with the answer that is both true and the strongest version of the truth.

---

## 1. "Why is the claim safe without locks?"

**The short answer.** Reducers run as serialized transactions. They do not
interleave. `claim_listing` checks whether `claimed_by` is `None` and, if it is,
writes. When two volunteers call it at the same instant, one transaction runs to
completion first; the second observes that write and returns `Err`. The second
*cannot* see the state the first one saw.

**Why that is interesting.** In a normal stack both requests read "unclaimed"
before either writes, both writes land, and two drivers get sent for one tray of
bagels. You fix that with `SELECT … FOR UPDATE`, an optimistic version column,
or a compare-and-swap retry loop. **We wrote none of it.** Correct behaviour is
the default here rather than the thing you remembered to add.

**Concede this before they raise it:** the REST version is fixable. The point is
not that REST cannot — it is that here the guarantee comes from the execution
model.

**Proof, if they want it:** hand them the laptop. Listing → *Prove the race →* →
*Fire 50.* `50 fired · 1 succeeded · 49 rejected · 85ms`.

*Code: `lib.rs`, `claim_listing`, around line 230.*

---

## 1b. "How do I know that 50-claim result isn't just text your app prints?"

**Concede it immediately — they are right, and agreeing is what makes the rest
credible.** The tally is computed in the browser. On its own it proves nothing.

Then give them three things the app does not control:

1. **The database's own log**, streaming in a separate terminal while it runs —
   one `claim ACCEPTED`, forty-nine `claim REJECTED`. Keep that window facing
   them when you fire it.
2. **The other laptop**, which shows the listing claimed. A second independent
   machine agrees.
3. **`spacetime sql`** afterwards — one row, one holder.

**The strongest single piece of evidence is not the in-app test at all.** It is
the CLI transcript, because the app is not involved:

```
$ spacetime call -- food-pickup claim_listing 30 & \
  spacetime call -- food-pickup claim_listing 30 & wait
[1]  - done       spacetime call -- food-pickup claim_listing 30
Error: Response text: Ella CLI claimed this first.
[2]  + exit 1     spacetime call -- food-pickup claim_listing 30
```

Two independent OS processes, one exit 0, one exit 1. Nothing there came from
code we wrote for the demo.

Use them for different jobs: the in-app test is the **memorable moment** and the
thing a judge can trigger themselves; the log beside it is what makes the moment
**credible**; the CLI transcript is the **fallback** if they push, or if the live
demo will not connect.

---

## 2. "Why a procedure and not a reducer for the AI?"

**Because a reducer must be deterministic** — no network, no clock, no
filesystem. That is not a limitation we worked around. **It is the same
all-or-nothing property that makes the contested claim correct.** A reducer that
could call an API could not offer that guarantee.

SpacetimeDB provides `#[procedure]` for exactly the work reducers must refuse.
So `ask_scraps` is a procedure: it opens a short transaction to read the board
and the API key, **closes it**, and only then makes the HTTPS call. Holding a
transaction open across a network round-trip would block the database on xAI's
latency.

**The browser never talks to xAI.** It asks the database; the database calls out.

*Code: `lib.rs`, `ask_scraps`, around line 632.*

---

## 3. "Where does the API key live?"

**In a private table.** `secret` has no `public`, so no client can read it and
codegen skips it entirely. The CLI says so out loud on every publish:

```
Skipping private tables during codegen: expiry_tick, secret
```

Nothing is in the browser bundle. Set with `set_secret`, read only by procedures.

**Honest caveat, if pressed:** any connected client can *call* any reducer, so
someone who knew the database name could overwrite a secret. They could never
read one. An owner check would need a column on a live table, which needs a
default, and there is no meaningful default `Identity` — so it would have meant
wiping the board. Reading is the property that matters.

---

## 4. "How do you know the model isn't making pickups up?"

Two things. The prompt contains **every open unclaimed pickup** with its real
distance from the volunteer's pin and real minutes remaining — the model is
answering about rows that exist. And the returned `listing_id` is **discarded
unless it appears in the list we supplied**, so it cannot point at something
invented.

The request body is built with `serde_json`, not string concatenation. Donor and
description are free text from anonymous clients; hand-rolling that JSON would
let a description full of quotes and braces restructure the request.

---

## 5. "Why does the count say '7 pickups' and not '7 of 15'?"

**Because we do not know what 15 is.** The radius is part of the *subscription
query* — `.gte()`/`.lte()` on `lat` and `lng` — so rows outside it were never
sent to this client. Showing a total would mean subscribing to the whole table,
which is the exact thing the feature avoids.

**The number being un-knowable is the feature working.**

Open DevTools → Network → WS and shrink the radius: traffic drops, because the
database stopped producing those rows.

**Implementation detail worth volunteering:** it is a bounding *box* server-side,
because the query builder compares columns to literals and has no trigonometry.
A client-side haversine trims the box corners to a true circle over the handful
of rows that survive. Server does the huge cheap reduction, client does the exact
tiny one.

*Code: `radius.ts`, `listingsWithin`.*

---

## 6. "Why isn't the photo a column on `listing`?"

Two reasons, and the second is the real one.

**Size.** A photo row is ~70KB against a listing row's ~200 bytes. Every client
subscribes to the board, so a photo column would push every image to everyone
who opened the map.

**Scoping.** A separate table lets the client subscribe to *one* photo — the
listing it is looking at. A volunteer who only wanted a map downloads zero photo
bytes.

**Also true:** a new column on a live table needs `#[default(...)]`, so extending
`listing` in place was never freely available anyway.

---

## 7. "What surprised you?"

The transaction boundary around our event table.

We added `claim_attempt` to broadcast every claim, won and lost, so contention
would be visible to everyone rather than only to the loser. We wrote a comment
predicting the losing write might not survive, then tested it against Maincloud:
exactly one row arrived, `won: true`.

A reducer returning `Err` aborts its whole transaction and the insert goes with
it. **The thing that closed off the feature is the same guarantee that makes the
claim correct.** We could recover the losses by always returning `Ok` and putting
the outcome in the row — but that costs the rejection message on the loser's
screen, which is the clearest thing in the demo. We kept the guarantee and
dropped the feature.

---

## 8. "What would you change for production?"

**Row-level security** — and be precise, because they wrote the product.
`#[client_visibility_filter]` exists on 2.10.1 but sits behind the crate's
`unstable` feature and carries `// TODO: RLS filters are currently unimplemented,
and are not enforced`. We planned a private contact table behind one, found that,
and cut it rather than claim security we did not have. Every public table is
genuinely world-readable today.

**Do not say "we used row-level security."** It would be wrong about their own
product, in front of the people who built it.

---

## 9. "Did you need SpacetimeDB for this?"

The contested claim, no — you could build it with row locks. **Everything
together, yes:**

| What | Mechanism |
|---|---|
| One winner under contention | Serialized reducers |
| Listings expiring with nobody watching | Scheduled table |
| Claims broadcast but never stored | Event table |
| "My pickups" computed server-side | `#[view]` |
| Radius as a query, not a filter | Scoped subscription |
| At most 3 open claims, un-raceable | Counted inside the transaction |
| The database calling an LLM and a geocoder | Procedures |

Two tables and five reducers became seven tables, nineteen reducers and three
procedures — and the client still has **no data-fetching code at all**. Two
`useTable` calls are the entire data layer.

---

## 10. The geocoder — the cleanest example in the project

A browser **cannot** set `User-Agent`. It is a forbidden header, dropped
silently, no error. OpenStreetMap's Nominatim policy asks callers to identify
themselves that way — so a browser-side geocode cannot comply, however it is
written. A module can.

That is logic living in the database **because it has to**, not because it reads
well in a pitch.

---

## Numbers to have ready

- **50 fired · 1 succeeded · 49 rejected · 85ms**
- **8 tables, 17 reducers, 3 procedures, 1 view** — ~1,310 lines of Rust
- **~190 lines** when the backend was just the core loop
- **2** `useTable` calls — the whole client data layer
- **0** lines of locking, retry, cache-invalidation or polling code
- **1** websocket during a five-minute demo, versus ~300 polled requests

## Things not to say

- ~~"We used row-level security"~~ — it is not enforced on 2.10.1
- ~~"Reducers can't call APIs so we couldn't do AI server-side"~~ — procedures can,
  and we used them
- ~~"It's faster than REST"~~ — the argument is correctness, not speed


---

## Wording

The UI says **User** and **Store**. The code and these notes say `volunteer` and
`donor`. Use the screen's words when pointing at the screen.
