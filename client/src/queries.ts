import { Identity } from 'spacetimedb'

import { tables } from './module_bindings'

/**
 * The board only ever renders listings that are still open — App filters
 * `!completed` and My Pickups derives from that same filtered set. Nothing in
 * the client reads a completed row.
 *
 * So scope the subscription instead of the array: the server stops sending
 * rows we would throw away, rather than us downloading the whole table and
 * discarding half of it in React. `.where` runs server-side.
 *
 * Both call sites must use this. `useTable` dedupes identical queries, but a
 * broader subscription anywhere still pulls every row to the client, so
 * scoping one place and not the other buys nothing.
 */
export const openListings = tables.listing.where((r) => r.completed.eq(false))

/**
 * The photo for one listing, and nothing else.
 *
 * Photos are ~1000x the size of a listing row, so they are the one thing on
 * this board that must not be subscribed to wholesale. Scoping the query to
 * the selected listing means a volunteer downloads the picture they are
 * looking at and none of the others — the server never sends the rest.
 *
 * `0n` matches nothing: ids are `auto_inc` and start at 1. A query is still
 * needed when no listing is selected because hooks cannot be called
 * conditionally.
 */
export function photoFor(listingId: bigint | null) {
  return tables.listingPhoto.where((r) => r.listingId.eq(listingId ?? 0n))
}

/**
 * The all-zero identity. SpacetimeDB never issues it, so a query filtered on
 * it matches nothing — the same trick `photoFor` plays with id `0n`.
 */
const NOBODY = new Identity(0n)

/**
 * One store's own photo, and nothing else.
 *
 * Same reasoning as `photoFor`: `donor_profile` is subscribed wholesale in
 * three places, so the picture lives in its own table and is fetched only for
 * the store actually on screen. A query is still needed when there is no store
 * in view, because hooks cannot be called conditionally.
 */
export function storePhotoFor(who: Identity | undefined) {
  return tables.donorPhoto.where((r) => r.identity.eq(who ?? NOBODY))
}
