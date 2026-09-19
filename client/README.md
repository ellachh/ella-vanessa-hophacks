# Relay — client

React + TypeScript + Vite. Owned by Vanessa (see `../PLAN.md`, File ownership).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build
```

## Status

**Phase 1 is done.** The map renders: Leaflet + OpenStreetMap tiles centred on
Baltimore at zoom 13, verified in a real browser (24/24 tiles painted, no
console errors).

**Phase 2 is blocked** on `src/module_bindings/`, which Ella generates with
`spacetime generate --lang typescript --out-dir client/src/module_bindings`.
Until those exist there are no `Listing`/`User` types and nothing to subscribe
to. See `../PROMPTS.md`, Handoff points.

## Two things that will bite

1. **The SDK is the npm package `spacetimedb`**, not
   `@clockworklabs/spacetimedb-sdk`. The old name's last release is a broken
   stub and will not install. Every tutorial still uses the old name.
2. **`src/module_bindings/` is generated — never hand-edit it.** If the types
   look wrong, the schema is wrong. Tell Ella; do not patch the output.

## Layout

| Path | What |
|---|---|
| `src/App.tsx` | Shell — header + map |
| `src/MapView.tsx` | Leaflet map. Listing markers land here in Phase 2. |
| `src/index.css` | Imports `leaflet/dist/leaflet.css` first. Without it the map is a grey box. |
