import { useCallback, useMemo, useState } from 'react'
import { useSpacetimeDB, useTable } from 'spacetimedb/react'

import ConnectionGate from './ConnectionGate'
import ListingPanel from './ListingPanel'
import MapView from './MapView'
import { isPlottable } from './listing'
import Toast from './Toast'
import { sameIdentity } from './identity'
import { tables } from './module_bindings'

/**
 * Composition only. Connection, loading and name-entry live in ConnectionGate,
 * so Board never renders until there is a connected, named volunteer and rows
 * have arrived.
 *
 * Ella owns this file for Phase 3 — new views mount inside <ConnectionGate>
 * alongside <Board />.
 */
export default function App() {
  return (
    <ConnectionGate>
      <Board />
    </ConnectionGate>
  )
}

function Board() {
  const { identity } = useSpacetimeDB()

  // This call IS the subscription. No fetching, no polling, no store — rows
  // change on the server, this array changes, React re-renders.
  const [listings] = useTable(tables.listing)
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
  const mine = useMemo(
    () => board.filter((l) => sameIdentity(l.claimedBy, identity)),
    [board, identity],
  )

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
            users={users}
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
