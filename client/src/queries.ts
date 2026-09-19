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
