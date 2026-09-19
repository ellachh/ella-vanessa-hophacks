import { useState } from 'react'
import { useReducer } from 'spacetimedb/react'
import type { Identity } from 'spacetimedb'

import { listingState } from './listing'
import StressTest from './StressTest'
import { reducers } from './module_bindings'
import type { Listing, User } from './module_bindings/types'
import { milesFrom, type LatLng } from './radius'
import { pickupClock, timeLeft, urgencyOf } from './pickupWindow'

/** Mirrors MAX_OPEN_CLAIMS in the module. Kept in sync by hand; the module is
 *  still the one that enforces it — this only warns earlier. */
const MAX_OPEN_CLAIMS = 3

export default function ListingPanel({
  listing,
  users,
  me,
  center,
  heldCount,
  onError,
}: {
  listing: Listing | null
  users: readonly User[]
  me: Identity | undefined
  center: LatLng
  heldCount: number
  onError: (message: string) => void
}) {
  const claim = useReducer(reducers.claimListing)
  const unclaim = useReducer(reducers.unclaimListing)
  const complete = useReducer(reducers.completeListing)
  const [busy, setBusy] = useState(false)

  if (!listing) {
    return (
      <aside className="panel panel--empty">
        <p>Select a pickup on the map.</p>
      </aside>
    )
  }

  const state = listingState(listing, me)
  const holder = listing.claimedBy
    ? users.find((u) => u.identity.isEqual(listing.claimedBy!))?.name
    : undefined

  /**
   * Never render optimistically. The reducer is authoritative and the row is
   * the only source of truth — we call, and the subscription re-renders us.
   * On rejection we show the module's own message, which for a lost race is
   * "Ella claimed this first."
   */
  async function run(fn: (params: { id: bigint }) => Promise<void>) {
    setBusy(true)
    try {
      await fn({ id: listing!.id })
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="panel">
      <span className={`badge badge--${state}`}>
        {state === 'open' ? 'Open' : state === 'mine' ? 'Yours' : `Claimed by ${holder ?? 'someone else'}`}
      </span>
      <h2 className="panel__donor">{listing.donor}</h2>
      <p className="panel__desc">{listing.description}</p>
      <p className={`panel__when panel__when--${urgencyOf(listing.pickupBy)}`}>
        {timeLeft(listing.pickupBy)}
      </p>
      <p className="panel__meta">Pick up by {pickupClock(listing.pickupBy)}</p>
      <p className="panel__meta">
        {milesFrom(center, listing).toFixed(1)} mi from your pin ·{' '}
        {/* A plain link, so no maps SDK, no API key and nothing to break
            offline. Opens whatever the volunteer already uses. */}
        <a
          className="panel__dir"
          href={`https://www.google.com/maps/dir/?api=1&destination=${listing.lat},${listing.lng}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          Directions ↗
        </a>
      </p>

      <div className="panel__actions">
        {state === 'open' &&
          (heldCount >= MAX_OPEN_CLAIMS ? (
            /* The module rejects this anyway. Saying so before the click turns
               a failure into a rule — and the rule is a concurrency limit, not
               a daily quota: delivering or releasing one frees a slot now. */
            <>
              <button className="btn" disabled>
                Claim this pickup
              </button>
              <p className="panel__limit">
                You're holding {heldCount} of {MAX_OPEN_CLAIMS} pickups. Deliver or
                release one to claim another — there's no daily cap, just three at
                a time.
              </p>
            </>
          ) : (
            <button className="btn btn--primary" disabled={busy} onClick={() => run(claim)}>
              {busy ? 'Claiming…' : 'Claim this pickup'}
            </button>
          ))}
        {state === 'mine' && (
          <>
            <button className="btn btn--primary" disabled={busy} onClick={() => run(complete)}>
              Mark delivered
            </button>
            <button className="btn" disabled={busy} onClick={() => run(unclaim)}>
              Release
            </button>
          </>
        )}
        {state === 'taken' && <p className="panel__meta">Someone else is on this one.</p>}
      </div>

      {/* Demo instrument, not a product feature — collapsed so nobody trips it
          by accident, but reachable when a judge asks how deep the guarantee
          goes. */}
      <StressTest listing={listing} />
    </aside>
  )
}
