import { MapContainer, TileLayer } from 'react-leaflet'

// Must be imported before any <Marker> renders. See the file for why.
import './leaflet-default-icon'

/** Downtown Baltimore — the whole demo is scoped to one city. */
export const BALTIMORE: [number, number] = [39.2904, -76.6122]

/**
 * The map surface. Phase 1 renders it bare; listing markers land here in
 * Phase 2, driven only by the SpacetimeDB subscription.
 */
export default function MapView() {
  return (
    <MapContainer className="map" center={BALTIMORE} zoom={13} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
    </MapContainer>
  )
}
