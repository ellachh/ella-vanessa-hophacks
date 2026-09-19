import { tables } from './module_bindings'
import type { Listing } from './module_bindings/types'

export type LatLng = [number, number]

/** Downtown Baltimore — where a volunteer starts before they move the pin. */
export const DEFAULT_CENTER: LatLng = [39.2904, -76.6122]

export const RADIUS_OPTIONS = [1, 2, 3, 5] as const
export type Radius = (typeof RADIUS_OPTIONS)[number] | null // null = no limit

const MILES_PER_DEG_LAT = 69.0

/** A degree of longitude shrinks with latitude, so this depends on where you are. */
function milesPerDegLng(lat: number): number {
  return MILES_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)
}

/**
 * The subscription itself, narrowed to a bounding box around the volunteer.
 *
 * This is the part worth pointing at: changing the radius, or dragging the pin,
 * changes the *query the server is running*. Rows outside the box are never
 * sent. Open the network panel and shrink the radius — traffic drops, because
 * the database stopped producing those rows.
 *
 * A box rather than a circle because the query builder compares columns to
 * literals; it has no trigonometry. `withinRadius` trims the corners on the
 * handful of rows that survive, which is the right division of labour: the
 * server does the huge cheap reduction, the client does the exact tiny one.
 */
export function listingsWithin(center: LatLng, radiusMiles: Radius) {
  if (radiusMiles === null) {
    return tables.listing.where((r) => r.completed.eq(false))
  }

  const [lat, lng] = center
  const dLat = radiusMiles / MILES_PER_DEG_LAT
  const dLng = radiusMiles / milesPerDegLng(lat)

  return tables.listing.where((r) =>
    r.completed
      .eq(false)
      .and(r.lat.gte(lat - dLat))
      .and(r.lat.lte(lat + dLat))
      .and(r.lng.gte(lng - dLng))
      .and(r.lng.lte(lng + dLng)),
  )
}

/** Great-circle distance in miles. */
export function milesFrom(center: LatLng, l: Pick<Listing, 'lat' | 'lng'>): number {
  const R = 3958.8
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(l.lat - center[0])
  const dLng = toRad(l.lng - center[1])
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(center[0])) * Math.cos(toRad(l.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Trims the bounding box back to a true circle. */
export function withinRadius(
  center: LatLng,
  l: Pick<Listing, 'lat' | 'lng'>,
  radiusMiles: Radius,
): boolean {
  if (radiusMiles === null) return true
  return milesFrom(center, l) <= radiusMiles
}

const KEY = 'scraps.center'

/** Remembering the pin across reloads is a per-viewer convenience, so localStorage. */
export function loadCenter(): LatLng {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_CENTER
    const v = JSON.parse(raw)
    if (
      Array.isArray(v) &&
      v.length === 2 &&
      Number.isFinite(v[0]) &&
      Number.isFinite(v[1])
    ) {
      return [v[0], v[1]]
    }
  } catch {
    // Private window, blocked storage, or corrupt value — the default is fine.
  }
  return DEFAULT_CENTER
}

export function saveCenter(c: LatLng): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {
    // Not worth surfacing; the pin just won't persist.
  }
}
