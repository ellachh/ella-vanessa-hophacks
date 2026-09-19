import { useState } from 'react'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import { Timestamp } from 'spacetimedb'
import { useReducer } from 'spacetimedb/react'

import { reducers } from './module_bindings'
// Side-effect import: fixes Leaflet's default marker in production builds.
import './leaflet-default-icon'
import './PostForm.css'

const BALTIMORE: [number, number] = [39.2904, -76.6122]

// Mirrors the caps in server/spacetimedb/src/lib.rs. The module is still the
// authority — this only saves a round trip and shows a live counter.
const MAX_DONOR = 80
const MAX_DESCRIPTION = 280

const WINDOWS = [
  { label: '1 hour', hours: 1 },
  { label: '2 hours', hours: 2 },
  { label: '4 hours', hours: 4 },
  { label: '8 hours', hours: 8 },
]

/** Clicking the map moves the pin. Dropping a pin beats typing coordinates. */
function PinPicker({
  position,
  onPick,
}: {
  position: [number, number]
  onPick: (p: [number, number]) => void
}) {
  useMapEvents({
    click(e) {
      onPick([e.latlng.lat, e.latlng.lng])
    },
  })
  return <Marker position={position} />
}

export default function PostForm({
  onClose,
  onError,
}: {
  onClose: () => void
  onError: (message: string) => void
}) {
  const post = useReducer(reducers.postListing)

  const [donor, setDonor] = useState('')
  const [description, setDescription] = useState('')
  const [hours, setHours] = useState(4)
  const [position, setPosition] = useState<[number, number]>(BALTIMORE)
  const [busy, setBusy] = useState(false)

  const ready = donor.trim().length > 0 && description.trim().length > 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    try {
      // Reducers take one params object, not positional arguments.
      await post({
        donor: donor.trim(),
        description: description.trim(),
        pickupBy: Timestamp.fromDate(new Date(Date.now() + hours * 3_600_000)),
        lat: position[0],
        lng: position[1],
      })
      // Nothing to update locally — the subscription delivers the new row to
      // every board, including this one. Just get out of the way.
      onClose()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Post a pickup">
      <form className="post" onSubmit={submit}>
        <header className="post__head">
          <h2 className="post__title">Post a pickup</h2>
          <button type="button" className="post__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <label className="post__label" htmlFor="donor">
          Donor
        </label>
        <input
          id="donor"
          className="post__input"
          value={donor}
          maxLength={MAX_DONOR}
          placeholder="Pratt Street Bakehouse"
          onChange={(e) => setDonor(e.target.value)}
          autoFocus
        />

        <label className="post__label" htmlFor="description">
          What is it?{' '}
          <span className="post__count">
            {description.length}/{MAX_DESCRIPTION}
          </span>
        </label>
        <textarea
          id="description"
          className="post__input post__input--area"
          value={description}
          maxLength={MAX_DESCRIPTION}
          rows={3}
          placeholder="About 20 day-old bagels and 6 loaves of sourdough"
          onChange={(e) => setDescription(e.target.value)}
        />

        <span className="post__label">Pick up within</span>
        <div className="post__windows">
          {WINDOWS.map((w) => (
            <button
              type="button"
              key={w.hours}
              className={`chip${hours === w.hours ? ' chip--on' : ''}`}
              onClick={() => setHours(w.hours)}
            >
              {w.label}
            </button>
          ))}
        </div>

        <span className="post__label">
          Where <span className="post__count">click the map to move the pin</span>
        </span>
        <div className="post__map">
          <MapContainer center={BALTIMORE} zoom={12} scrollWheelZoom={false}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
            <PinPicker position={position} onPick={setPosition} />
          </MapContainer>
        </div>

        <div className="post__actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={!ready || busy}>
            {busy ? 'Posting…' : 'Post pickup'}
          </button>
        </div>
      </form>
    </div>
  )
}
