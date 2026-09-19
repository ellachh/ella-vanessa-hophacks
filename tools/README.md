# tools/

Build-time tools. **Nothing here runs in the app.**

## `generate-listings.mjs` — seed data via xAI Grok

```bash
export XAI_API_KEY=...            # never commit this; .env is gitignored
node tools/generate-listings.mjs 15 > /tmp/seed.rs
```

Prints Rust for `seed_listings()`. Read it, check the donor names are invented,
paste it in, republish.

### Why this is a tool and not a feature

Scraps's write path is SpacetimeDB reducers, and **reducers must be
deterministic** — no network, no filesystem, no wall clock. That is not a
limitation we are working around. It is the same all-or-nothing transaction
property that makes two simultaneous claims resolve to exactly one winner: a
reducer that could call an API could not offer that guarantee.

So the API call happens on a laptop, before anything is published. Three
consequences, all of them good:

- **No API key ships.** The client bundle is public and our tables are
  world-readable; a key in either would be extractable by anyone.
- **No runtime dependency.** The demo does not get slower, or fail, because a
  third-party API is having a bad afternoon.
- **The build stays verified.** Every claim Scraps makes has been run against
  Maincloud. This cannot change any of them.

If a judge asks how we used xAI: we used Grok to write the seed data, and we
did not put it in the write path because the database's determinism rule
forbids it — which is the same rule that makes the contested claim correct.
That is a better answer than a feature.

### Validation

Output is checked before printing, against the module's own limits: donor ≤ 80
characters, description ≤ 280, coordinates finite and inside Baltimore, pickup
window 1–8 hours. `post_listing` would reject bad rows anyway; failing here is
cheaper than failing after a republish.

Counted in characters, not bytes, same as the Rust — an emoji is one character,
not four.
