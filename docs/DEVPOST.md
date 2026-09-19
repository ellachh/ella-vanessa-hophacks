# Devpost writeup — draft

Paste into the standard Devpost fields. Written to be read by someone who
cannot ask us a question, which is the opposite of the demo.

**Before submitting:** screenshots of the board with 15 listings, the rejection
toast mid-race, and the two-laptop setup. Repo link. Track: SpacetimeDB.

**Lead with `docs/race.png`.** It is the technical argument in one picture, and
a Devpost reader cannot ask us a question — so the thing we would say out loud
has to be visible before they scroll. Upload it as the first image, above the
screenshots.

---

![Two volunteers tap Claim on the same listing at the same instant. SpacetimeDB
runs the two reducer calls as serialized transactions: the first reads
claimed_by as empty and commits, the second reads it as already set and aborts.
One volunteer gets the pickup; the other is told who beat her.](race.png)

*Two taps, one instant, one winner — and no locking code anywhere in the
project.*

---

## Inspiration

Food gets thrown out twenty minutes from someone who needs it, and the reason
usually isn't supply — it's coordination. Two volunteers drive to the same
restaurant; a third pickup expires because nobody knew it existed.

That failure is a **contested-claim race**: two people acting on the same stale
view of shared state. We wanted to build the version where that cannot happen,
and it turned out the interesting part wasn't the app at all. It was what the
database does when two people tap at the same instant.

## What it does

Relay is a live food-rescue board for Baltimore. Restaurants and grocers post
surplus food; volunteer drivers see it on a map and claim pickups. Every other
volunteer's screen updates instantly — no refresh, no polling.

When two volunteers tap Claim on the same pickup in the same instant, exactly
one wins. The other is told who beat them.

That is easy to assert and hard to believe, so the app can prove it on demand:
a button fires **50 concurrent claims** at one listing and reports the tally.
Against the live database it comes back **1 succeeded, 49 rejected, 85ms** —
no double-claim, no lost write, and no locking code on our side. A judge can
press it themselves.

Unclaimed listings whose pickup window passes delete themselves, on a timer
inside the database, with no client involved.

## How we built it

**SpacetimeDB 2.10.1**, which isn't a database you put behind a server — it's a
database you put your server *inside*. Our application logic compiles to
WebAssembly and runs in the database; clients subscribe to queries and the
database pushes changes.

- **Backend**: one Rust module. Four tables, ten reducers, one server-side view.
- **Frontend**: React + TypeScript, Leaflet + OpenStreetMap.
- **Data layer**: two `useTable` calls. That's the whole thing — there is no
  fetching code anywhere in the client.

We used four SpacetimeDB features that most projects won't touch:

| Feature | What we do with it |
|---|---|
| Serialized reducers | The contested claim resolves with no locking code |
| Scheduled tables | Unclaimed listings expire on a 30-second timer |
| Event tables | Claims broadcast to every client without being stored |
| Server-side views | "My pickups" is computed in the database, not in React |

Plus a claim ceiling — three open pickups per volunteer — counted **inside the
transaction**, so it can't be raced any more than the claim itself can.

## Challenges we ran into

**The transaction boundary ate a feature.** We added an event table to broadcast
every claim attempt, won and lost, so contention would be visible to everyone
rather than only to the loser. We wrote a comment predicting the losing write
might not survive, then tested it against the live database: exactly one row
arrived, `won: true`.

A reducer returning `Err` aborts its entire transaction, and the insert goes
with it. **The property that killed the feature is the same all-or-nothing
guarantee that makes the contested claim correct.** We could recover the losses
by returning `Ok` on every path and putting the outcome in the row — but that
costs the rejection message on the loser's screen, which is the clearest thing
in the demo. We kept the guarantee and dropped the feature.

**Row-level security doesn't exist yet.** We planned a private table for donor
address and phone, guarded by `#[client_visibility_filter]`. It compiles. It
publishes. Reading the crate source, it's behind an `unstable` feature and
carries `// TODO: RLS filters are currently unimplemented, and are not
enforced.` We cut the table rather than ship a security claim with nothing
behind it.

**An `Option` column can't be an index-filter argument**, and a view can only
start from an index — it can't scan. `claimed_by` was the natural key for "my
pickups"; we index `completed` instead and narrow in Rust.

**Our own scheduled reducer ate the demo board overnight.** We came back to six
listings, all claimed — every unclaimed one had aged past its pickup window and
been deleted exactly as designed. Correct behaviour, genuinely alarming at 3am.
We added a `reset_board` reducer and put it in the rehearsal checklist.

## Accomplishments we're proud of

**We wrote no locking code.** No `SELECT … FOR UPDATE`, no compare-and-swap, no
retry loop, no version column. The contested claim is a four-line check-then-set
that is correct because reducers are serialized transactions.

We proved it rather than asserting it. Fifty concurrent claims fired at a single
listing from one browser:

> **50 fired · 1 succeeded · 49 rejected · 85ms**

One write survived. No locks, no retries, no double-claim. It's a button in the
app, so a judge can press it themselves rather than take our word for it.

We also killed two features on purpose. Under a judging criterion that reads
*most polished*, a half-built feature is a visible defect, not evidence of
ambition.

## What we learned

Neither of us had written Rust. It turned out not to matter much: a SpacetimeDB
module is table structs and small mutation functions — no async, no lifetimes,
no `Arc<Mutex<>>`. About 400 lines total, and the hard parts of Rust never
appeared.

The bigger lesson was about where correctness lives. In a normal stack, "two
people can't claim the same thing" is something you remember to implement. Here
it's a property of the execution model, and the work is understanding the model
rather than defending against it.

And the thing we'd tell anyone starting: **don't trust any SpacetimeDB example
you find online.** The API moved between versions and the npm package was
renamed — the old name still resolves but its last release is a broken stub.
Every tutorial we found was wrong. The template's own shipped guidance was
right.

## What's next

**Row-level security**, when it lands. Every table we have is world-readable,
which is correct for a public board and wrong for the donor contact details a
real deployment needs.

**Presence** — `client_connected` / `client_disconnected` are first-class
lifecycle reducers, so showing which volunteers are online is nearly free.

**Per-listing presence**, which is the MMO use case in miniature: seeing that
someone else is looking at the pickup you're about to claim, before either of
you taps.

## Built with

`rust` · `spacetimedb` · `webassembly` · `typescript` · `react` · `vite` ·
`leaflet` · `openstreetmap`
