# Relay — client

React + TypeScript + Vite. The board, the map, and everything a volunteer
touches. The backend lives in `../server`.

```bash
npm install          # node_modules is gitignored — do this after every fresh clone
npm run dev          # http://localhost:5173
npm test             # 24 vitest cases over the pure logic
npm run build        # tsc -b && vite build
```

`npm run dev` holds the terminal — that is the server running, not a hang. Open
a second tab for anything else.

## How it works

Two `useTable` calls are the entire data layer:

```tsx
const [listings] = useTable(openListings)   // scoped server-side to open rows
const [users] = useTable(tables.user)
```

There is no `fetch`, no polling and no store anywhere in this directory. Rows
change on the server, those arrays change, React re-renders. Writes go through
reducers, which authorize against `ctx.sender`.

Claims never render optimistically. We call the reducer and wait for the row —
greying a pin on click would mean lying to whoever lost the race.

## Files

| Path | What | Owner |
|---|---|---|
| `App.tsx` | Composition + the board | E |
| `PostForm.tsx`, `MyPickups.tsx` | Post a pickup; what you are holding | E |
| `ConnectionGate.tsx` | Connecting / connection-lost / name-entry states | V |
| `MapView.tsx` | Leaflet map, markers, popups, empty state | V |
| `ListingPanel.tsx` | Detail + claim / release / deliver | V |
| `StressTest.tsx` | Fires 50 concurrent claims, reports the tally | V |
| `ContentionFeed.tsx` | Live feed of successful claims | V |
| `Toast.tsx` | The losing claimant's message | V |
| `pins.ts` | Marker artwork. **Unescaped** — static markup only | V |
| `listing.ts`, `pickupWindow.ts` | Pure logic, unit-tested | V |
| `queries.ts`, `config.ts`, `identity.ts` | Subscription scope, Maincloud target, identity compare | V |
| `module_bindings/` | **Generated.** Never hand-edit — regenerate | E |

## Five things that will bite

1. **The SDK package is `spacetimedb`**, not `@clockworklabs/spacetimedb-sdk`.
   The old name's last release is a stub that fails to install. Every tutorial
   online still uses the old name.
2. **`module_bindings/` is generated.** If the types look wrong the schema is
   wrong — tell Ella, do not patch the output.
3. **Leaflet's default marker icons break in `npm run build` but not
   `npm run dev`.** Fixed in `leaflet-default-icon.ts`; do not delete that
   import from `MapView`. `../CLAUDE.md`, trap #6.
4. **`Identity` is a class.** `===` compares references and is always false for
   equal identities — use `sameIdentity`. Getting this wrong renders every one
   of your own claims as someone else's. There is a test asserting it.
5. **`divIcon`'s `html` is not escaped.** Listing text is free-form input from
   any anonymous client, so only ever put static artwork there. Text goes in
   react-leaflet's `<Popup>`, which React escapes. Verified with injection
   payloads in a real browser — see `../PLAN.md`.

## Theme

Warm paper, set by tokens on `:root` in `index.css`. Listing states are
semantic tokens — `--open`, `--mine`, `--taken` — and differ by **shape** as
well as colour, because watching a pin go from solid to hollow is the demo and
a hue change alone is easy to miss.

Display face is Instrument Serif, loaded from Google Fonts, with Georgia ahead
of the generic serif. A failed font load changes the character without moving
the layout.

Ella's `PostForm.css` and `AppActions.css` still carry a few colours hardcoded
for the old dark theme. They are overridden in the compatibility block at the
bottom of `index.css` and should fold into the tokens when she next edits them.

## What is not tested here

`npm test` covers the pure logic — the coordinate guard, identity comparison,
pickup-window formatting. It does not cover anything that needs a live
database. The stress test and the two-laptop claim have to be run against
Maincloud by hand.
