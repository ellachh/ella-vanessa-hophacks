import { tables } from './module_bindings'
import type { Listing } from './module_bindings/types'

/** Downtown Baltimore. Every seeded listing sits within a few miles of here. */
export const CENTER: [number, number] = [39.2904, -76.6122]

export const RADIUS_OPTIONS = [1, 2, 3, 5] as const
export type Radius = (typeof RADIUS_OPTIONS)[number] | null // null = no limit

// Degrees per mile. Latitude is ~constant; longitude shrinks with latitude, so
// at Baltimore's 39.29° a degree of longitude is about 53 miles, not 69.
const MILES_PER_DEG_LAT = 69.0
const MILES_PER_DEG_LNG = 69.0 * Math.cos((CENTER[0] * Math.PI) / 180)

/**
 * The subscription itself, narrowed to a bounding box around `CENTER`.
 *
 * This is the part worth pointing at: changing the radius changes the *query
 * the server is running*, not an array we filter afterwards. Rows outside the
 * box are never sent. Open the network panel and shrink the radius — traffic
 * drops, because the database stopped producing those rows.
 *
 * A box rather than a circle because the query builder compares columns to
 * literals; it has no trigonometry. `withinRadius` below trims the corners on
 * the handful of rows that survive, which is the right division of labour:
 * the server does the cheap, huge reduction, the client does the exact, tiny one.
 */
export function listingsWithin(radiusMiles: Radius) {
  const open = tables.listing.where((r) => r.completed.eq(false))
  if (radiusMiles === null) return open

  const dLat = radiusMiles / MILES_PER_DEG_LAT
  const dLng = radiusMiles / MILES_PER_DEG_LNG
  const [lat, lng] = CENTER

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
export function milesFromCenter(l: Pick<Listing, 'lat' | 'lng'>): number {
  const R = 3958.8
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(l.lat - CENTER[0])
  const dLng = toRad(l.lng - CENTER[1])
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(CENTER[0])) * Math.cos(toRad(l.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Trims the bounding box back to a true circle. */
export function withinRadius(l: Pick<Listing, 'lat' | 'lng'>, radiusMiles: Radius): boolean {
  if (radiusMiles === null) return true
  return milesFromCenter(l) <= radiusMiles
}
