# Why Scraps is built the way it is

Design notes from Ella and Vanessa. Not a feature list — `README.md` has that.
This is the reasoning, including the parts we got wrong and changed.

---

## It started at a co-op

We both worked at a local food co-op. Farms and nearby stores would donate
leftovers in bulk, and our job was to break the pallets down, package them, and
get them out to people who needed them.

The food was never the hard part. Coordination was. Somebody drives across town
for a pickup another volunteer collected an hour ago. A crate of produce sits
past the point where anyone can use it because the person who knew about it went
home. None of that is a supply problem. It is everyone working from a slightly
out-of-date picture of the same shared state.

That is the problem we wanted to build for, and it is why the demo is two
laptops rather than one. One screen cannot show a coordination failure.

---

## First we built two clicks

The whole thing started as one interaction:

1. A store posts surplus food.
2. Two volunteers tap **Claim** at the same moment.
3. One gets it. The other is told who beat them.

That is still the centre of the project. The reason it matters is the reducer
behind it:

```rust
if let Some(holder) = listing.claimed_by {
    return Err(format!("{who} claimed this first."));
}
// ...otherwise take it
```

A read, a decision, and a write. No lock, no transaction block we wrote
ourselves, no retry loop, no version column. SpacetimeDB runs reducers as
serialized transactions, so when two of those run against the same row, one of
them sees the other's write and gives up. The correctness comes from where the
code runs, not from what the code says.

We could have stopped there. For about an hour we thought we would.

---

## Then we kept going, for two reasons

**The track is "Best Use of SpacetimeDB", and two clicks is not a use.** A race
resolved by an `if` statement is a good argument, but it only exercises one
feature. If we were going to claim we understood this database, we should be
able to show more of it than a single conditional.

**And we wanted something that could survive the weekend.** Neither of us wanted
to build a demo that only works because a judge is looking at it for four
minutes. If we were going to spend the night on a food-rescue board, it should
be one a co-op could plausibly use on a Monday.

Those two goals mostly pointed the same direction, which is why the project grew
the way it did.

---

## What we added, and what each one was for

| What | Why it earned its place |
|---|---|
| **Scheduled expiry** | Unclaimed food past its window deletes itself every 30 seconds. No client is involved and none is awake for it. This is the database running our code on its own schedule. |
| **A broadcast event table** | Every claim attempt is broadcast and never stored. Clients get a live contention feed without a growing table behind it. |
| **A server-side view** | "Your pickups" is computed inside the database against the caller's identity, not filtered in React. |
| **A claim ceiling** | Three open pickups per person, counted *inside* the transaction, so it cannot be raced any more than the claim can. |
| **Procedures** | The database makes its own outbound HTTP calls: an assistant that reads the live board, a description drafter, and an address lookup. |

The last one is the one we would point at first, and not for the AI. See below.

---

## Decisions worth explaining

### The geocoder runs inside the database because it has to

Typing an address and getting a pin is not an impressive feature. Where it runs
is the interesting part.

OpenStreetMap's geocoder asks callers to identify themselves with a descriptive
`User-Agent` header. A browser will not let a page set that header. It is on the
forbidden list, and `fetch` drops it silently — no error, no warning, the request
just goes out anonymous and out of policy.

A SpacetimeDB procedure can set it. So the lookup lives in the database because
that is the only place it can be done correctly, not because it reads well in a
pitch. Of everything here, that is the clearest case of the architecture earning
something real.

### Photos are their own tables

A photo is roughly a thousand times the size of a listing row, and every client
subscribes to the board. Putting an image column on `listing` would mean the
volunteer who only wanted a map downloads fifteen photographs on connect.

So photos live in `listing_photo` and `donor_photo`, and clients subscribe to
them scoped to whatever is on screen. Open a pickup, get that one photo. Nothing
else is sent.

We want to be accurate about why. An earlier version of our notes said these
*had* to be separate tables because of a migration restriction. That was wrong,
and a teammate caught it: a string column with a default migrates onto a live
table fine. They are separate because of subscription weight. "We had to" would
have been both false and a weaker answer.

### We did not build accounts

SpacetimeDB gives every client a cryptographic identity, and `ctx.sender` is an
authenticated principal a client cannot forge. Our entire authorization model
rests on it — release and deliver both check it before writing.

That is real authentication. It is just anonymous. Adding a login would have
demonstrated a feature every backend has, and it would have put a signup form in
front of the ten seconds the project is actually about.

### We did not claim row-level security

We designed a table to hold a donor's private contact details behind a
`#[client_visibility_filter]`, and then we read the crate:

```rust
// TODO: RLS filters are currently unimplemented, and are not enforced.
```

It compiles. It publishes. It enforces nothing. We cut the table rather than
ship a feature we would have had to lie about. Everything public in this
database is genuinely world-readable, and we would rather say that out loud than
be caught claiming otherwise in front of the people who wrote the product.

### The stress test holds its claim now

We added a button that fires 50 simultaneous claims at one listing and reports
the tally. One gets through, 49 are turned down, in about 45ms.

The first version released the claim the moment the run finished, so repeated
rehearsals stayed clean. That was the wrong call. It meant the only thing worth
looking at disappeared before anyone could look at it — you could not check the
other laptop, read the log, or query the row.

It holds the claim now, and releasing is a separate press. A tally on a screen is
an assertion. A row someone can go and find is evidence.

---

## What we deliberately did not build

Several of these were asked for and turned down on purpose.

- **Store verification.** We cannot actually verify that anyone is a restaurant.
  A green tick that means nothing is worse than no tick.
- **Multi-leg handoffs between volunteers.** Interesting, and a second race we
  did not have time to get right.
- **Pickup history.** The subscription is deliberately scoped to open listings.
  History would have meant widening it, which undoes the thing we were showing.
- **Notifications, routing, recommendations.** None of them make the claim race
  clearer.

The rule we worked to: a half-built feature is worse than a missing one. The
prize criterion is a polished app, and under that, an unfinished clever thing is
a visible defect rather than evidence of ambition.

---

## What would make it real

Honest list, if this carried on past the weekend.

1. **Private contact details**, once row-level security actually lands. A real
   pickup needs a door number and a phone, and neither belongs in a world-
   readable table.
2. **Photo storage that is not a database column.** Base64 in a row is the right
   trade for a weekend and the wrong one for a year. Object storage, and the
   table holds a URL.
3. **A real identity for stores.** Not a tick, but something like a co-op
   vouching for the businesses it already works with. Trust borrowed from an
   institution that has it, rather than invented by us.
4. **Multi-city.** Nothing here is Baltimore-specific except the seed data and
   the default map centre.

None of that changes the centre of the project. The claim race is the same at
fifteen listings and fifteen thousand.

---

## The honest summary

Food rescue is the setting. We chose it because we have done the work and
because it makes contested state legible to a stranger in ten seconds.

The thing we actually built is a demonstration that when application logic lives
inside the database, a whole category of coordination bug stops being something
you write code to prevent. Two people tap at once. One of them gets it. We did
not write a line of locking to make that true.
