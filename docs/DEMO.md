# Demo script

Owner: **Ella** gives the technical pitch — the argument is about serialized
transactions and she wrote the reducers. **Vanessa** drives the second laptop and
takes product and design questions.

Target: **3 minutes**, then stop talking. Judges ask better questions than we can
anticipate, and the prize card says *polished*, not *comprehensive*.

---

## Before judges arrive — the setup checklist

Run this every time, even if "nothing changed since last time."

- [ ] Both laptops on the **same** Maincloud module (`food-pickup`), not a local server
- [ ] **Both volunteers have set names.** The race message reads
      "Vanessa claimed this first" by looking up the `user` table — without a
      name it degrades to "Someone else" and the best line in the demo lands flat
- [ ] **Reset the board** — `spacetime call food-pickup reset_board`. Do this
      before every rehearsal and once more before judging. It wipes and re-seeds
      with pickup windows measured from now. Without it, `expire_listings` will
      have deleted every unclaimed listing whose window has passed, leaving a
      board that is entirely claimed and that `seed_board` refuses to refill.
- [ ] Ella holds **fewer than 3 open claims**, or every claim fails with the
      ceiling message instead of the contention message
- [ ] A third window open with `spacetime logs food-pickup -f`
- [ ] Browser zoom up, DevTools **closed** (we open it deliberately, later)
- [ ] One rehearsal run, all the way through, on this exact setup

## The beats

**1. What it is — 15 seconds.**
> "Relay is a live food-rescue board for Baltimore. Restaurants post surplus
> food, volunteers claim pickups. The interesting part isn't the app, it's what
> happens when two volunteers want the same one."

**2. Post a listing — 20 seconds.**
Post on Ella's laptop. Say nothing while it appears on Vanessa's.
> "Nobody refreshed anything. No polling. The database pushed that."

**3. The contested claim — 45 seconds. This is the demo.**
Both open the same pickup. Count out loud: three, two, one. Both tap.
> "Same listing, same instant. In a normal stack both requests read 'unclaimed'
> before either writes, both writes land, and two drivers get sent for one tray
> of bagels. You fix that with row locks or a compare-and-swap loop.
>
> In SpacetimeDB our code runs *inside* the database, and reducers are
> serialized transactions. The second one physically cannot see the state the
> first one saw. One wins, the other is told why. **We wrote no locking code.**"

Point at the loser's toast — *"Vanessa claimed this first."*

**4. Deliver it — 10 seconds.**
Winner marks it delivered. It clears from both boards.

**5. The part nobody touches — 20 seconds.**
Have a listing posted with a ~90-second window before you start.
> "Watch — nobody touch anything."

The pin vanishes from both laptops. Point at the log window printing
`expired listing=N`.
> "A scheduled reducer. The database called our code on a timer. No client was
> involved — there's nothing running on either laptop that could have done that."

**6. Close — 15 seconds.**
> "Two tables, five reducers, about 190 lines of Rust. No API layer, no
> websocket server, no cache, no locking. The reducers *are* the API."

Then stop. Let them ask.

## If asked, in rough order of likelihood

**"Why not just build this with REST?"**
Open `docs/why-spacetimedb.html`. Lead with the concession: the REST version is
fixable with `SELECT … FOR UPDATE` or a CAS loop. The point isn't that REST
can't — it's that correct behaviour is the *default* here rather than the thing
you remembered to add.

**"Isn't that just an `if` statement?"**
Best answer is the stress test: fire 50 concurrent claims, exactly one wins.
Hand them the laptop and let them press it. Two people tapping is an anecdote;
50 simultaneous calls is a demonstrated guarantee.

**"How do you stop someone claiming as another user?"**
```bash
spacetime describe food-pickup reducer claim_listing --json
```
One parameter: the listing id. There is nowhere to put an identity, because it
comes from `ctx.sender()` on the authenticated connection.

**"How do you know it's not polling?"**
*Now* open DevTools → Network → WS. One connection, no repeating requests.
Better than any number we could assert, because they verify it themselves.

**"What would you change for production?"**
Row-level security. Both tables are `public`, so every client reads every row —
fine for a public board, wrong for anything sensitive. `#[client_visibility_filter]`
exists on 2.10.1 but is behind an `unstable` feature and the crate states it is
not enforced, so we cut the private-contact table rather than ship a security
claim with nothing behind it.

**"What surprised you?"**
The transaction boundary around our event table — and it's a better story
because we were wrong in a useful direction.

We added a `claim_attempt` event table to broadcast every claim, won or lost,
and wrote a comment predicting the losing write might not survive. It doesn't.
A reducer returning `Err` aborts its whole transaction, so the `won: false`
insert is discarded and subscribers only ever see winners.

The thing that closed off the feature is the same all-or-nothing property that
makes the contested claim correct. We could get losses back by always returning
`Ok` and putting the outcome in the event row — but that costs the rejection
message on the loser's screen, which is the clearest thing in this demo. So we
kept the guarantee and dropped the feature.

## When it goes wrong

| Symptom | Do this |
|---|---|
| Both screens stale | Check both are on Maincloud, not a local server |
| Claim does nothing | Ella is probably at the 3-claim ceiling. Release one. |
| "Someone else claimed this first" | A name wasn't set. Reload and set it. |
| Live demo won't connect at all | Show the saved CLI race transcript in `PLAN.md`. Don't apologise, present it as the receipt. |
| Anything half-built is visible | Revert to `demo-v1`. A visible defect costs more than a missing feature under a polish criterion. |

## Rehearse it three times

Not twice. The third run is where you find the thing that only breaks when
you're talking.
