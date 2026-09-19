import { useCallback, useMemo, useState } from 'react'
import { useSpacetimeDB, useTable } from 'spacetimedb/react'

import ListingPanel from './ListingPanel'
import MapView, { isPlottable } from './MapView'
import NameGate from './NameGate'
import Toast from './Toast'
import { sameIdentity } from './identity'
import { tables } from './module_bindings'

export default function App() {
  const { isActive, identity, connectionError } = useSpacetimeDB()

  // These two calls ARE the subscription. No fetching, no polling, no store —
  // rows change on the server, these arrays change, React re-renders.
  const [listings, listingsReady] = useTable(tables.listing)
  const [users] = useTable(tables.user)

  const [selectedId, setSelectedId] = useState<bigint | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const dismiss = useCallback(() => setToast(null), [])

  // A completed pickup clears from every board — that is the last demo beat.
  const board = useMemo(
    () => listings.filter((l) => !l.completed && isPlottable(l)),
    [listings],
  )
  const selected = useMemo(
    () => board.find((l) => l.id === selectedId) ?? null,
    [board, selectedId],
  )
  const named = useMemo(
    () => users.some((u) => sameIdentity(u.identity, identity)),
    [users, identity],
  )
  const mine = useMemo(
    () => board.filter((l) => sameIdentity(l.claimedBy, identity)),
    [board, identity],
  )

  if (connectionError) {
    return <div className="gate"><p className="gate__error">{connectionError.message}</p></div>
  }
  if (!isActive || !listingsReady) {
    return <div className="gate"><p className="gate__sub">Connecting…</p></div>
  }
  if (!named) {
    return <NameGate onDone={() => undefined} />
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Relay</h1>
        <p className="app__tagline">Live food rescue board — Baltimore</p>
        <span className="app__count">
          {board.length} open · {mine.length} yours
        </span>
      </header>
      <main className="app__body">
        <div className="app__map">
          <MapView
            listings={board}
            me={identity}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
        <ListingPanel listing={selected} users={users} me={identity} onError={setToast} />
      </main>
      <Toast message={toast} onDismiss={dismiss} />
    </div>
  )
}
