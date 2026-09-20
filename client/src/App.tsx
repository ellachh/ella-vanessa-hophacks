import { useCallback, useMemo, useState } from 'react'
import { useSpacetimeDB, useTable } from 'spacetimedb/react'

import AskPanel from './AskPanel'
import ConnectionGate from './ConnectionGate'
import GenerateScraps from './GenerateScraps'
import ListingPanel from './ListingPanel'
import MapView from './MapView'
import MyPickups from './MyPickups'
import PostForm from './PostForm'
import { isPlottable } from './listing'
import Toast from './Toast'
import { sameIdentity } from './identity'
import { tables } from './module_bindings'
import RadiusFilter from './RadiusFilter'
import RestaurantView from './RestaurantView'
import YouAreHere from './YouAreHere'
import { listingsWithin, loadCenter, saveCenter, withinRadius, type LatLng, type Radius } from './radius'
import './AppActions.css'

/**
 * Composition only. Connection, loading and name-entry live in ConnectionGate,
 * so Board never renders until there is a connected, named volunteer and rows
 * have arrived.
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
  //
  // Scoped to open listings server-side: a completed pickup stops being sent
  // rather than being sent and discarded. `board` still filters `completed`
  // because a row can complete while we hold it, and the local filter is what
  // makes it leave the map in that instant.
  const [radius, setRadius] = useState<Radius>(null)
  const [center, setCenter] = useState<LatLng>(loadCenter)

  const moveTo = useCallback((c: LatLng) => {
    setCenter(c)
    saveCenter(c)
  }, [])

  // The radius and the volunteer's position are part of the QUERY, not a filter
  // over the result. Narrowing either re-scopes the subscription and the server
  // stops sending those rows.
  const [listings] = useTable(listingsWithin(center, radius))
  const [users] = useTable(tables.user)

  // Everything below is view state — which pin is open, which panel is showing,
  // whether a modal is up. None of it is data. Data lives in the two
  // subscriptions above and nowhere else.
  //
  // `mode` still says 'volunteer' and 'donor' although the buttons now read
  // User and Store. The words in the database and in this union were left
  // alone on purpose; see docs/CLAUDE.md.
  const [selectedId, setSelectedId] = useState<bigint | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const [showMine, setShowMine] = useState(false)
  const [mode, setMode] = useState<'volunteer' | 'donor'>('volunteer')
  const dismiss = useCallback(() => setToast(null), [])

  // A completed pickup clears from every board — that is the last demo beat.
  // The server sends a bounding box; this trims it to a true circle. Two lines
  // of arithmetic over a handful of rows, not a scan over the whole table.
  const board = useMemo(
    () =>
      listings.filter(
        (l) => !l.completed && isPlottable(l) && withinRadius(center, l, radius),
      ),
    [listings, center, radius],
  )
  // The open pin, found in `board` rather than kept as its own copy. If the
  // listing leaves the board — claimed by someone else, expired, delivered —
  // this goes null and the panel empties on its own.
  const selected = useMemo(
    () => board.find((l) => l.id === selectedId) ?? null,
    [board, selectedId],
  )

  // What this volunteer is holding. Drives the Your pickups list and the count
  // that warns before the three-claim ceiling bites.
  const mine = useMemo(
    () => board.filter((l) => sameIdentity(l.claimedBy, identity)),
    [board, identity],
  )

  // Switching to donor mode widens the subscription back out. The radius is a
  // volunteer's "how far will I drive"; a donor's own listings should never be
  // hidden from them because of it.
  const switchMode = useCallback((next: 'volunteer' | 'donor') => {
    setMode(next)
    if (next === 'donor') setRadius(null)
    setShowMine(false)
  }, [])

  // Jumping to a pickup from the list shows it in the detail panel.
  const jumpTo = useCallback((id: bigint) => {
    setSelectedId(id)
    setShowMine(false)
  }, [])

  return (
    <div className="app">
      {/* Title, live counts, and the controls. The count changes meaning with
          the mode: a user cares how many pickups are open, a store cares how
          many of its own are up. */}
      <header className="app__header">
        <h1 className="app__title">Scraps</h1>
        <p className="app__tagline">Baltimore food rescue board</p>
        <span className="app__count">
          {mode === 'donor'
            ? `${board.filter((l) => sameIdentity(l.postedBy, identity)).length} posted by you`
            : `${board.length} open · ${mine.length} yours`}
        </span>
        <div className="app__actions">
          <GenerateScraps onError={setToast} />
          {/* Two roles over one board. Nothing is verified here — it is a
              different reading of rows we already hold, not a claim about who
              anyone is. */}
          <div className="mode" role="group" aria-label="Act as">
            <button
              className={`mode__btn${mode === 'volunteer' ? ' mode__btn--on' : ''}`}
              aria-pressed={mode === 'volunteer'}
              onClick={() => switchMode('volunteer')}
            >
              User
            </button>
            <button
              className={`mode__btn${mode === 'donor' ? ' mode__btn--on' : ''}`}
              aria-pressed={mode === 'donor'}
              onClick={() => switchMode('donor')}
            >
              Store
            </button>
          </div>
          {mode === 'volunteer' ? (
            <button
              className={`btn${showMine ? ' btn--on' : ''}`}
              onClick={() => setShowMine((v) => !v)}
            >
              Your pickups ({mine.length})
            </button>
          ) : (
            <button className="btn btn--primary" onClick={() => setPosting(true)}>
              Post a pickup
            </button>
          )}
        </div>
      </header>

      <main className="app__body">
        <div className="app__map">
          <MapView
            listings={board}
            users={users}
            me={identity}
            selectedId={selectedId}
            onSelect={setSelectedId}
          >
            <YouAreHere center={center} radius={radius} onMove={moveTo} />
          </MapView>
          {mode === 'volunteer' && (
            <div className="map__control">
              <RadiusFilter value={radius} onChange={setRadius} shown={board.length} />
            </div>
          )}
        </div>
        {mode === 'donor' ? (
          <RestaurantView
            listings={board}
            users={users}
            me={identity}
            onPost={() => setPosting(true)}
            onError={setToast}
          />
        ) : showMine ? (
          <MyPickups listings={mine} onSelect={jumpTo} onError={setToast} />
        ) : (
          /* Assistant above the listing detail. `panel--stack` owns the column
             chrome so ListingPanel's own `.panel` can flatten inside it — see
             AskPanel.css. Volunteer mode only: donors post, they don't seek. */
          <aside className="panel panel--stack">
            <AskPanel center={center} onRecommend={jumpTo} />
            <hr className="ask__rule" />
            <ListingPanel
              listing={selected}
              users={users}
              me={identity}
              center={center}
              heldCount={mine.length}
              onError={setToast}
            />
          </aside>
        )}
      </main>

      {posting && <PostForm onClose={() => setPosting(false)} onError={setToast} />}
      <Toast message={toast} onDismiss={dismiss} />
    </div>
  )
}
