import { divIcon } from 'leaflet'

import type { ListingState } from './listing'

/**
 * Marker artwork.
 *
 * SECURITY: this markup goes through Leaflet's `divIcon`, which does NOT
 * escape. Only static artwork belongs here — never a donor name, a description
 * or any other listing field. Text goes in the <Popup>, which React escapes.
 * See CLAUDE.md, Security.
 *
 * Design rules, because they are load-bearing rather than taste:
 *
 * - The teardrop body is identical in all three states, so the eye tracks one
 *   object changing rather than one being swapped for another. Watching a pin
 *   change state is the demo.
 * - States differ by SHAPE, not only colour. `taken` is hollow where the others
 *   are solid, which survives being small, being greyed, and being colourblind.
 *   Colour alone at this size is easy to miss.
 * - The body uses `currentColor`, set by `.pin--*` in index.css. That is what
 *   lets the 280ms grey-out animate — a hardcoded fill would jump instead.
 * - Almost no interior detail. At 22px wide the glyph is about 8px; anything
 *   finer turns to mush.
 */

/** Teardrop, point at the bottom of the viewBox so it marks an exact spot. */
const BODY = 'M11 0C4.93 0 0 4.93 0 11c0 7.8 11 19 11 19s11-11.2 11-19C22 4.93 17.07 0 11 0z'

/**
 * A crate, not a bag. The first attempt was a bag with a handle arc, and at
 * actual size the handle-over-body silhouette read as a PADLOCK — which says
 * "locked", the opposite of "available". A rectangle with a lid line has no
 * such collision and survives being 8px wide.
 */
const CRATE = `
  <rect x="6.6" y="8.4" width="8.8" height="7.2" rx="1.1"
        fill="#fff" fill-opacity=".93"/>
  <path d="M6.6 11.1h8.8" stroke="currentColor" stroke-width="1.15"
        stroke-opacity=".5"/>`

const CHECK = `
  <path d="M7.2 11.4l2.6 2.6 5-5.2" fill="none" stroke="#fff" stroke-opacity=".95"
        stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>`

const svg = (inner: string) =>
  `<svg viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`

const GLYPH: Record<ListingState, string> = {
  // Solid body, crate inside — available, go and get it.
  open: svg(`<path d="${BODY}" fill="currentColor"/>${CRATE}`),
  // Solid body, tick — you are on this one.
  mine: svg(`<path d="${BODY}" fill="currentColor"/>${CHECK}`),
  // Hollow body — visibly emptied out. The shape change is the point.
  taken: svg(
    `<path d="${BODY}" fill="none" stroke="currentColor" stroke-width="2.4"/>` +
      `<circle cx="11" cy="11" r="3.1" fill="currentColor" fill-opacity=".55"/>`,
  ),
}

export const PIN_W = 22
export const PIN_H = 30

export function pinIcon(state: ListingState, selected: boolean) {
  const classes = ['pin', `pin--${state}`, selected && 'pin--selected']
    .filter(Boolean)
    .join(' ')

  return divIcon({
    className: '',
    html: `<span class="${classes}">${GLYPH[state]}</span>`,
    iconSize: [PIN_W, PIN_H],
    // Anchor at the tip, not the centre — the point marks the actual location.
    iconAnchor: [PIN_W / 2, PIN_H],
    popupAnchor: [0, -PIN_H + 6],
  })
}
