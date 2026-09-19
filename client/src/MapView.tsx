import { divIcon } from 'leaflet'
import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import type { Identity } from 'spacetimedb'

import './leaflet-default-icon'
import { sameIdentity } from './identity'
import type { Listing } from './module_bindings/types'

/** Downtown Baltimore — the whole demo is scoped to one city. */
export const BALTIMORE: [number, number] = [39.2904, -76.6122]

/**
 * The module rejects non-finite and out-of-range coordinates, so this should
 * never fire. It stays because every client subscribes to every row: one bad
 * value throws inside Leaflet and takes down the board for everyone, not just
 * whoever posted it. Cheap insurance on a shared failure.
 */
export function isPlottable(l: Listing): boolean {
  return (
    Number.isFinite(l.lat) &&
    Number.isFinite(l.lng) &&
    l.lat >= -90 &&
    l.lat <= 90 &&
    l.lng >= -180 &&
    l.lng <= 180
  )
}

type State = 'open' | 'mine' | 'taken'

export function listingState(l: Listing, me: Identity | undefined): State {
  if (!l.claimedBy) return 'open'
  return sameIdentity(l.claimedBy, me) ? 'mine' : 'taken'
}

/** divIcon rather than an image pin, so state is a CSS class and transitions. */
function pin(state: State, selected: boolean) {
  return divIcon({
    className: '',
    html: `<span class="pin pin--${state}${selected ? ' pin--selected' : ''}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

export default function MapView({
  listings,
  me,
  selectedId,
  onSelect,
}: {
  listings: readonly Listing[]
  me: Identity | undefined
  selectedId: bigint | null
  onSelect: (id: bigint) => void
}) {
  return (
    <MapContainer className="map" center={BALTIMORE} zoom={13} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      {listings.map((l) => (
        <Marker
          key={String(l.id)}
          position={[l.lat, l.lng]}
          icon={pin(listingState(l, me), l.id === selectedId)}
          eventHandlers={{ click: () => onSelect(l.id) }}
        />
      ))}
    </MapContainer>
  )
}
