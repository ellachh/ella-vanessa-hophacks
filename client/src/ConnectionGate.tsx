import { useMemo, type ReactNode } from 'react'
import { useSpacetimeDB, useTable } from 'spacetimedb/react'

import NameGate from './NameGate'
import { sameIdentity } from './identity'
import { tables } from './module_bindings'

/**
 * Everything that has to be true before the board can render: we are connected,
 * the initial rows have arrived, and this volunteer has a display name.
 *
 * This lives outside App.tsx on purpose. Both of us are in client/ during
 * Phase 3 and App.tsx was the one file we would both have edited — Ella mounts
 * her new views there, and these states used to sit there too. Moving them out
 * means neither of us has to wait on the other. See PROMPTS.md, Phase 3.
 */
export default function ConnectionGate({ children }: { children: ReactNode }) {
  const { isActive, identity, connectionError } = useSpacetimeDB()

  // Subscribing here as well as in the board is free: the SDK dedupes
  // identical queries, so this is the same subscription, not a second one.
  const [, listingsReady] = useTable(tables.listing)
  const [users, usersReady] = useTable(tables.user)

  const named = useMemo(
    () => users.some((u) => sameIdentity(u.identity, identity)),
    [users, identity],
  )

  // Ordered most-broken first. A connection error outranks a missing name,
  // because "set your name" is unanswerable if nothing can reach the server.
  if (connectionError) {
    return (
      <div className="gate">
        <div className="gate__card gate__card--center">
          <h1 className="gate__title">Can't reach the board</h1>
          <p className="gate__sub">
            Relay needs internet to reach the database — it is hosted, not on
            this laptop. Check the wifi, then reload.
          </p>
          <p className="gate__error">{connectionError.message}</p>
          <button className="btn btn--primary" onClick={() => location.reload()}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!isActive || !listingsReady || !usersReady) {
    return (
      <div className="gate">
        <div className="gate__card gate__card--center">
          <span className="spinner" aria-hidden="true" />
          <p className="gate__sub">Connecting to the board…</p>
        </div>
      </div>
    )
  }

  if (!named) return <NameGate onDone={() => undefined} />

  return <>{children}</>
}
