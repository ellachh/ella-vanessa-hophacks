import { divIcon } from 'leaflet'

import type { ListingState } from './listing'

/**
 * Marker artwork, kept in one place so swapping the placeholder dots for
 * hand-drawn SVGs is a single edit rather than a change to MapView.
 *
 * SECURITY: this markup goes through Leaflet's `divIcon`, which does NOT
 * escape. Only static artwork belongs here — never a donor name, a
 * description, or any other listing field. Text goes in the <Popup>, which
 * React escapes. See CLAUDE.md, Security.
 *
 * TO DROP IN THE DRAWN PINS: paste each SVG into GLYPH below as a string with
 * no width/height attributes (let CSS size it) and no hardcoded fill on the
 * body shape — use `fill="currentColor"` so the existing state colours in
 * index.css keep working and the transition still animates.
 */
const GLYPH: Record<ListingState, string> = {
  open: '',
  mine: '',
  taken: '',
}

/** Placeholder pins are circles; drawn ones will want more room. */
export const PIN_SIZE = 18

export function pinIcon(state: ListingState, selected: boolean) {
  const classes = ['pin', `pin--${state}`, selected && 'pin--selected']
    .filter(Boolean)
    .join(' ')

  return divIcon({
    className: '',
    html: `<span class="${classes}">${GLYPH[state]}</span>`,
    iconSize: [PIN_SIZE, PIN_SIZE],
    iconAnchor: [PIN_SIZE / 2, PIN_SIZE / 2],
  })
}
