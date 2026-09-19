import { divIcon } from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import type { Identity } from 'spacetimedb'

import './leaflet-default-icon'
import { sameIdentity } from './identity'
import { listingState, type ListingState } from './listing'
import type { Listing, User } from './module_bindings/types'
import { timeLeft, urgencyOf } from './pickupWindow'

/** Downtown Baltimore — the whole demo is scoped to one city. */
export const BALTIMORE: [number, number] = [39.2904, -76.6122]

/**
 * divIcon rather than an image pin, so state is a CSS class and transitions.
 *
 * This is the one place in the client that builds an HTML string, and it is
 * safe only because nothing user-controlled reaches it: `state` is a union
 * computed from `claimedBy`, and `selected` is a boolean. Never interpolate
 * `donor`, `description` or a volunteer's name in here — any listing field is
 * free-form input from an anonymous client, and this string is not escaped.
 * Text belongs in the <Popup> below, which React escapes.
 */
function pin(state: ListingState, selected: boolean) {
  return divIcon({
    className: '',
    html: `<span class="pin pin--${state}${selected ? ' pin--selected' : ''}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

export default function MapView({
  listings,
  users,
  me,
  selectedId,
  onSelect,
}: {
  listings: readonly Listing[]
  users: readonly User[]
  me: Identity | undefined
  selectedId: bigint | null
  onSelect: (id: bigint) => void
}) {
  return (
    <div className="map-wrap">
      <MapContainer className="map" center={BALTIMORE} zoom={13} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        {listings.map((l) => {
          const state = listingState(l, me)
          const holder = l.claimedBy
            ? users.find((u) => sameIdentity(u.identity, l.claimedBy))?.name
            : undefined

          return (
            <Marker
              key={String(l.id)}
              position={[l.lat, l.lng]}
              icon={pin(state, l.id === selectedId)}
              eventHandlers={{ click: () => onSelect(l.id) }}
            >
              {/*
                react-leaflet's <Popup> renders JSX children through React, so
                donor and description are escaped. NEVER build these with
                Leaflet's bindPopup(), which takes a raw HTML string and does
                not escape: listing text is free-form input from any anonymous
                client, so that would be stored XSS. See CLAUDE.md, Security.
              */}
              <Popup>
                <span className={`popup__when popup__when--${urgencyOf(l.pickupBy)}`}>
                  {timeLeft(l.pickupBy)}
                </span>
                <strong className="popup__donor">{l.donor}</strong>
                <span className="popup__desc">{l.description}</span>
                <span className="popup__state">
                  {state === 'open'
                    ? 'Open — click to claim'
                    : state === 'mine'
                      ? 'Yours'
                      : `Claimed by ${holder ?? 'someone else'}`}
                </span>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>

      {listings.length === 0 && (
        <div className="empty" role="status">
          <p className="empty__title">No open pickups right now</p>
          <p className="empty__sub">
            New listings appear here the moment a donor posts one — no refresh
            needed.
          </p>
        </div>
      )}
    </div>
  )
}
