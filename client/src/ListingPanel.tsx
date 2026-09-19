import { useState } from 'react'
import { useReducer } from 'spacetimedb/react'
import type { Identity } from 'spacetimedb'

import { listingState } from './MapView'
import { reducers } from './module_bindings'
import type { Listing, User } from './module_bindings/types'

function pickupBy(l: Listing): string {
  return l.pickupBy.toDate().toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function ListingPanel({
  listing,
  users,
  me,
  onError,
}: {
  listing: Listing | null
  users: readonly User[]
  me: Identity | undefined
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
      <p className="panel__meta">Pick up by {pickupBy(listing)}</p>

      <div className="panel__actions">
        {state === 'open' && (
          <button className="btn btn--primary" disabled={busy} onClick={() => run(claim)}>
            {busy ? 'Claiming…' : 'Claim this pickup'}
          </button>
        )}
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
    </aside>
  )
}
