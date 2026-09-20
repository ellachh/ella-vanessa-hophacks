import { useState } from 'react'
import { useReducer } from 'spacetimedb/react'

import { reducers } from './module_bindings'
import type { Listing } from './module_bindings/types'
import { timeLeft, urgencyOf } from './pickupWindow'
import './MyPickups.css'

/**
 * The fourth screen CLAUDE.md asks for: everything this volunteer is holding,
 * with the two actions that close the loop.
 *
 * The rows come from the same subscription as the map — there is no separate
 * query. If another client's reducer changes one of these listings, this list
 * re-renders with it.
 */
export default function MyPickups({
  listings,
  onSelect,
  onError,
}: {
  listings: readonly Listing[]
  onSelect: (id: bigint) => void
  onError: (message: string) => void
}) {
  // The two reducers that close the loop: give a pickup back, or mark it
  // delivered. Both are refused by the module unless you hold the claim.
  const unclaim = useReducer(reducers.unclaimListing)
  const complete = useReducer(reducers.completeListing)

  // Which row is mid-call, so only that row's buttons disable rather than the
  // whole list.
  const [busyId, setBusyId] = useState<bigint | null>(null)

  // Shared wrapper for both actions: mark the row busy, call the reducer, show
  // whatever it says if it refuses. Nothing is updated locally — the row
  // changes when the subscription delivers the new version.
  async function run(id: bigint, fn: (params: { id: bigint }) => Promise<void>) {
    setBusyId(id)
    try {
      await fn({ id })
    } catch (err) {
      // Surface the module's own message — it explains the refusal better than
      // anything we could invent here.
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  if (listings.length === 0) {
    return (
      <aside className="panel panel--empty">
        <p>
          Nothing claimed yet.
          <br />
          Pick one up from the map.
        </p>
      </aside>
    )
  }

  return (
    <aside className="panel mine">
      <h2 className="mine__title">Your pickups</h2>
      <ul className="mine__list">
        {listings.map((l) => {
          const busy = busyId === l.id
          return (
            <li key={String(l.id)} className="mine__item">
              <button
                type="button"
                className="mine__jump"
                onClick={() => onSelect(l.id)}
                title="Show on map"
              >
                <span className="mine__donor">{l.donor}</span>
                <span className={`mine__when mine__when--${urgencyOf(l.pickupBy)}`}>
                  {timeLeft(l.pickupBy)}
                </span>
              </button>
              <p className="mine__desc">{l.description}</p>
              <div className="mine__actions">
                <button
                  className="btn btn--primary"
                  disabled={busy}
                  onClick={() => run(l.id, complete)}
                >
                  {busy ? 'Working…' : 'Mark delivered'}
                </button>
                <button className="btn" disabled={busy} onClick={() => run(l.id, unclaim)}>
                  Release
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
