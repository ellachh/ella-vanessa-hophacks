import { useEffect, useRef, useState } from 'react'
import { Timestamp } from 'spacetimedb'
import { useProcedure, useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react'

import MapPicker, { BALTIMORE } from './MapPicker'
import PhotoInput from './PhotoInput'
import { sameIdentity } from './identity'
import { procedures, reducers, tables } from './module_bindings'
import './PostForm.css'

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

export default function PostForm({
  onClose,
  onError,
}: {
  onClose: () => void
  onError: (message: string) => void
}) {
  // One reducer inserts the listing and its photo in the same transaction.
  // "Post, then attach" is not available: a reducer cannot return the new id,
  // so the client would have to guess which row it had just made.
  const post = useReducer(reducers.postListingWithPhoto)
  const suggest = useProcedure(procedures.suggestDescription)

  const { identity } = useSpacetimeDB()
  const [profiles] = useTable(tables.donorProfile)
  const mine = profiles.find((p) => sameIdentity(p.identity, identity))

  const [description, setDescription] = useState('')
  const [hours, setHours] = useState(4)
  const [photo, setPhoto] = useState('')
  const [busy, setBusy] = useState(false)

  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [thinking, setThinking] = useState(false)

  /**
   * The saved restaurant profile fills the name and the pin.
   *
   * `null` means "the donor hasn't touched this", so the profile shows
   * through; the first edit pins it. Deriving it this way rather than copying
   * the profile into state with an effect matters because the profile arrives
   * over a subscription — it can land several frames after this form opens,
   * and an effect racing that would either overwrite typing or miss entirely.
   */
  const [typedDonor, setTypedDonor] = useState<string | null>(null)
  const [pinned, setPinned] = useState<[number, number] | null>(null)

  const donor = typedDonor ?? mine?.name ?? ''
  const position: [number, number] = pinned ?? (mine ? [mine.lat, mine.lng] : BALTIMORE)
  // MapContainer reads `center` once, on mount. If the profile arrives after
  // that, the derived position has moved but the map has not — so tell it.
  const recentre = !pinned && mine ? 1 : 0

  const ready = donor.trim().length > 0 && description.trim().length > 0
  // A photo alone is enough to ask for a caption — that is the point.
  const canSuggest = donor.trim().length > 0 && (description.trim().length > 0 || !!photo)

  /**
   * Ask Grok for a description — from the photo, a rough note, or both.
   *
   * The call runs as a `#[procedure]` inside the database, which is where the
   * API key lives: a private table no client can read. Nothing about this is
   * load-bearing. It writes into the same field the donor could have typed
   * themselves, and if it fails, posting is unaffected.
   */
  async function askForSuggestion() {
    if (!canSuggest || thinking) return
    setThinking(true)
    setSuggestion(null)
    try {
      const result = await suggest({
        donor: donor.trim(),
        note: description.trim(),
        photo,
      })
      if (!result.ok) {
        onError(result.error)
        return
      }
      setSuggestion(result.text)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setThinking(false)
    }
  }

  // Suggest as soon as a photo arrives, unless the donor has already written
  // something — overwriting their words would be rude. The ref makes this fire
  // once per photo rather than on every render.
  const suggestedFor = useRef<string>('')
  useEffect(() => {
    if (!photo || photo === suggestedFor.current) return
    if (description.trim() || !donor.trim()) return
    suggestedFor.current = photo
    void askForSuggestion()
    // askForSuggestion closes over current state; re-running on every change
    // would re-ask mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo])

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
        photo,
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
          Store
        </label>
        <input
          id="donor"
          className="post__input"
          value={donor}
          maxLength={MAX_DONOR}
          placeholder="Store name"
          onChange={(e) => setTypedDonor(e.target.value)}
          autoFocus
        />

        <span className="post__label">Photo</span>
        <PhotoInput value={photo} onChange={setPhoto} onError={onError} />

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

        <div className="suggest">
          <button
            type="button"
            className="btn btn--small"
            onClick={askForSuggestion}
            disabled={!canSuggest || thinking}
          >
            {thinking
              ? 'Asking Grok…'
              : photo && !description.trim()
                ? 'Describe the photo with Grok'
                : 'Tidy this up with Grok'}
          </button>
          <span className="suggest__hint">
            {photo && !description.trim()
              ? 'Grok reads the photo — or write it yourself and skip this.'
              : 'Jot it down roughly — or write it yourself and skip this.'}
          </span>
        </div>

        {suggestion && (
          <div className="suggest__card">
            <p className="suggest__text">{suggestion}</p>
            <div className="suggest__actions">
              <button
                type="button"
                className="btn btn--small btn--primary"
                onClick={() => {
                  setDescription(suggestion)
                  setSuggestion(null)
                }}
              >
                Use this
              </button>
              <button
                type="button"
                className="btn btn--small"
                onClick={() => setSuggestion(null)}
              >
                Keep mine
              </button>
            </div>
          </div>
        )}

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
        <MapPicker position={position} onPick={setPinned} recentreToken={recentre} />

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
