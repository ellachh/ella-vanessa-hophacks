# Pre-demo verification

Every feature, in the order a judge would hit them. Run the whole thing after
any publish. Anything that fails and cannot be fixed properly gets reverted —
under a *polish* criterion a broken feature costs more than a missing one.

## 0. Publish and regenerate

```bash
cd ~/Downloads/ella-vanessa-hophacks && git pull --rebase origin main
cd server
spacetime publish food-pickup --yes          # read the migration plan
spacetime generate --lang typescript --out-dir ../client/src/module_bindings
cd ../client && npx tsc -b                   # MUST print nothing
```

Then set the secrets — these are per-database, not per-publish, so they survive:

```bash
spacetime call food-pickup set_secret '"xai_api_key"' '"xai-..."'
spacetime call food-pickup set_secret '"xai_model"' '"grok-3"'
spacetime call food-pickup set_secret '"xai_vision_model"' '"<a vision-capable id>"'
```

`xai_vision_model` is only read when a photo is attached. If photo captions fail
while text ones work, that id is wrong — fix it with `set_secret`, no republish.

```bash
spacetime call food-pickup arm_expiry
spacetime call food-pickup reset_board
spacetime logs food-pickup -f                # leave running
```

## 1. Board and identity

- [ ] Both laptops load, both set a name
- [ ] 15 listings, invented donors only — **no real business names**
- [ ] Header count matches what is on the map

## 2. The core loop — this is the demo, it must be perfect

- [ ] Post a listing on one laptop → appears on the other, untouched
- [ ] Both open the same pin, count down, both claim
- [ ] One wins; loser sees `<name> claimed this first.`
- [ ] Both maps show it taken
- [ ] Winner marks delivered → clears from **both** boards
- [ ] Release works, and the listing returns to open on both

## 3. Radius

- [ ] Pin is visible; drag it and the board re-scopes
- [ ] 1 / 2 / 3 / 5 / Any all change the count
- [ ] Circle matches the chosen distance
- [ ] Pin position survives a reload

## 4. Stress test

- [ ] Hold fewer than 3 claims first, or every attempt hits the ceiling
- [ ] "Prove the race →" → "Fire 50" → **50 fired · 1 succeeded · 49 rejected**
- [ ] It releases its own claim; run it twice
- [ ] Contention feed shows **one** line, not fifty — the 49 rejections roll back
      their own broadcast rows

## 5. Ask Scraps

- [ ] "something sweet" returns a real listing, no `id=` in the prose
- [ ] "Show on map →" selects that pin
- [ ] Expand opens the wide view; backdrop closes it
- [ ] Ask something nonsense — it declines gracefully rather than inventing

## 6. Photos and captions

- [ ] Upload a photo → **a caption is suggested without typing anything**
- [ ] "Use this" fills the description; "Keep mine" dismisses it
- [ ] **The description box does not shrink** when the photo preview appears
- [ ] A too-large photo is refused with readable copy, not a stack trace
- [ ] Posted listing shows its photo on the other laptop
- [ ] In the stacked panel, **the Claim button is still above the fold** with a
      photo present — the photo is capped to 150px there, unverified until now

## 7. Donor mode

- [ ] Switching modes works and Post is donor-only
- [ ] A donor sees their own listings, and a claim changes the row live
- [ ] Geocoding an address lands the pin in the right place

## 8. Expiry

- [ ] Post with a 90-second window from the CLI, touch nothing
- [ ] It vanishes from both laptops and the log prints `expired listing=N`

## 9. Production build — do not skip

```bash
cd client && npm run build && npm run preview
```

- [ ] Walk the entire list again on the preview build
- [ ] Map markers render — trap #6 appeared **only** in production, with no
      console error
- [ ] Then open the Netlify URL and do it once more

## 10. Last

- [ ] `reset_board`
- [ ] Three full rehearsals of `docs/DEMO.md`
- [ ] Screenshots: full board, rejection toast mid-race, stress tally, a photo listing
- [ ] **Submit to Devpost** — `docs/DEVPOST.md` is paste-ready. This is the only
      item on any list that cannot be recovered from.
