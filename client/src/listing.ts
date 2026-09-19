import type { Identity } from 'spacetimedb'

import { sameIdentity } from './identity'
import type { Listing } from './module_bindings/types'

export type ListingState = 'open' | 'mine' | 'taken'

/**
 * The module rejects non-finite and out-of-range coordinates, so this should
 * never fire. It stays because every client subscribes to every row: one bad
 * value throws inside Leaflet and takes down the board for everyone, not just
 * whoever posted it. Cheap insurance on a shared failure.
 */
export function isPlottable(l: Listing): boolean {
  return (
    Number.isFinite(l.lat) &&
    Number.isFinite(l.lng) &&
    l.lat >= -90 &&
    l.lat <= 90 &&
    l.lng >= -180 &&
    l.lng <= 180
  )
}

/** `claimedBy` unset means open; otherwise it is mine only if the identities match. */
export function listingState(l: Listing, me: Identity | undefined): ListingState {
  if (!l.claimedBy) return 'open'
  return sameIdentity(l.claimedBy, me) ? 'mine' : 'taken'
}
