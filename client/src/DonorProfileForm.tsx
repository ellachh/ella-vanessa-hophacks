import { useState } from 'react'
import { useProcedure, useReducer } from 'spacetimedb/react'

import MapPicker, { BALTIMORE } from './MapPicker'
import PhotoInput from './PhotoInput'
import { procedures, reducers } from './module_bindings'
import type { DonorProfile } from './module_bindings/types'
import './DonorProfile.css'

// Mirror the caps in server/spacetimedb/src/lib.rs. The module still enforces
// them; these only save a round trip and drive the live counters.
const MAX_NAME = 80
const MAX_BIO = 240
const MAX_ADDRESS = 120

/**
 * A store's standing details: name, what they are, where they are, and a
 * photo of the place.
 *
 * The point is that a store fills this in once. `PostForm` reads it back and
 * pre-fills the name and the pin, so posting surplus food is a description and
 * a time — not the same three fields retyped every evening.
 *
 * The address is geocoded by a `#[procedure]` running inside the database, not
 * by this component. That is not architectural preciousness: OpenStreetMap's
 * geocoder asks callers for a descriptive User-Agent, and a browser will not
 * let a page set that header. The module can.
 */
export default function DonorProfileForm({
  existing,
  existingPhoto,
  onClose,
  onError,
}: {
  existing: DonorProfile | undefined
  /** The store's current photo, or '' for none. Lives in its own table, so it
   *  arrives as a separate subscription and saves through its own reducer. */
  existingPhoto: string
  onClose: () => void
  onError: (message: string) => void
}) {
  const save = useReducer(reducers.saveDonorProfile)
  const savePhoto = useReducer(reducers.saveDonorPhoto)
  const removePhoto = useReducer(reducers.removeDonorPhoto)
  const geocode = useProcedure(procedures.geocode)

  const [name, setName] = useState(existing?.name ?? '')
  const [bio, setBio] = useState(existing?.bio ?? '')
  const [address, setAddress] = useState(existing?.address ?? '')
  const [position, setPosition] = useState<[number, number]>(
    existing ? [existing.lat, existing.lng] : BALTIMORE,
  )
  const [photo, setPhoto] = useState(existingPhoto)

  // Two separate in-flight flags: saving the profile, and looking up an
  // address. They can overlap, and sharing one would disable the wrong button.
  const [busy, setBusy] = useState(false)
  const [looking, setLooking] = useState(false)
  // Bumping this pans the map. A geocoded address that silently moved a pin
  // off-screen would look like nothing happened.
  const [recentre, setRecentre] = useState(0)
  const [found, setFound] = useState<string | null>(null)

  const ready = name.trim().length > 0

  async function findAddress() {
    if (!address.trim() || looking) return
    setLooking(true)
    setFound(null)
    try {
      const result = await geocode({ address: address.trim() })
      if (!result.ok) {
        // The module writes these sentences to be shown as they are.
        onError(result.error)
        return
      }
      setPosition([result.lat, result.lng])
      setRecentre((n) => n + 1)
      setFound(result.label)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setLooking(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    try {
      await save({
        name: name.trim(),
        bio: bio.trim(),
        address: address.trim(),
        lat: position[0],
        lng: position[1],
      })

      // Separate table, separate reducer. Only written when it changed: a
      // no-op rewrite would still replicate to everyone subscribed to it.
      if (photo !== existingPhoto) {
        // `remove_donor_photo` takes no arguments — it acts on ctx.sender()
        // and nothing else — so the generated handle takes none either.
        if (photo) await savePhoto({ dataUri: photo })
        else await removePhoto()
      }
      onClose()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Your restaurant">
      <form className="post" onSubmit={submit}>
        <header className="post__head">
          <h2 className="post__title">Your store</h2>
          <button type="button" className="post__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <p className="post__note">
          Fill this in once. Every pickup you post starts from it.
        </p>

        <label className="post__label" htmlFor="profile-name">
          Name
        </label>
        <input
          id="profile-name"
          className="post__input"
          value={name}
          maxLength={MAX_NAME}
          placeholder="Store name"
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <label className="post__label" htmlFor="profile-bio">
          About you{' '}
          <span className="post__count">
            {bio.length}/{MAX_BIO}
          </span>
        </label>
        <textarea
          id="profile-bio"
          className="post__input post__input--area"
          value={bio}
          maxLength={MAX_BIO}
          rows={2}
          placeholder="A line about your store"
          onChange={(e) => setBio(e.target.value)}
        />

        <label className="post__label" htmlFor="profile-address">
          Address
        </label>
        <div className="geo">
          <input
            id="profile-address"
            className="post__input geo__input"
            value={address}
            maxLength={MAX_ADDRESS}
            placeholder="Street address"
            onChange={(e) => {
              setAddress(e.target.value)
              setFound(null)
            }}
            onKeyDown={(e) => {
              // Enter in this field means "look it up", not "submit the form".
              if (e.key === 'Enter') {
                e.preventDefault()
                void findAddress()
              }
            }}
          />
          <button
            type="button"
            className="btn geo__go"
            onClick={findAddress}
            disabled={!address.trim() || looking}
          >
            {looking ? 'Finding…' : 'Find on map'}
          </button>
        </div>
        {found && <p className="geo__found">Pin moved to {found}</p>}

        <span className="post__label">
          Where <span className="post__count">or click the map to move the pin</span>
        </span>
        <MapPicker position={position} onPick={setPosition} recentreToken={recentre} />

        <span className="post__label">Photo of your store</span>
        <PhotoInput
          value={photo}
          onChange={setPhoto}
          onError={onError}
          label="Add a photo of your store"
          hint="Shown to anyone looking at your pickups"
          alt="Your store"
        />

        <div className="post__actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={!ready || busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
