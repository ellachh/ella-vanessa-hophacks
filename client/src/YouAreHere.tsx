import { divIcon } from 'leaflet'
import { Circle, Marker, Tooltip } from 'react-leaflet'

import type { LatLng, Radius } from './radius'

const MILES_TO_METRES = 1609.34

/**
 * Static HTML, no interpolation — same rule as MapView's pins. Nothing
 * user-controlled may ever go in a divIcon's `html`.
 */
const homeIcon = divIcon({
  className: '',
  html: '<span class="here__dot"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

/**
 * "You are here", and the circle the radius filter is measured from.
 *
 * Without this the radius filter is arithmetic against an invisible point —
 * listings vanish and nothing on screen explains why. Drag the pin and the
 * subscription re-scopes around the new position.
 *
 * Rendered as a child of <MapContainer> via MapView's children slot, because
 * react-leaflet overlays have to live inside the map context.
 */
export default function YouAreHere({
  center,
  radius,
  onMove,
}: {
  center: LatLng
  radius: Radius
  onMove: (c: LatLng) => void
}) {
  return (
    <>
      {radius !== null && (
        <Circle
          center={center}
          radius={radius * MILES_TO_METRES}
          pathOptions={{
            color: 'var(--accent, #b8730a)',
            weight: 1.5,
            opacity: 0.7,
            fillOpacity: 0.06,
          }}
          interactive={false}
        />
      )}
      <Marker
        position={center}
        icon={homeIcon}
        draggable
        autoPan
        eventHandlers={{
          dragend(e) {
            const { lat, lng } = e.target.getLatLng()
            onMove([lat, lng])
          },
        }}
      >
        <Tooltip direction="top" offset={[0, -12]}>
          You are here — drag to move
        </Tooltip>
      </Marker>
    </>
  )
}
