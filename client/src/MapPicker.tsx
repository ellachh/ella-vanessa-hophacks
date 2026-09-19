import { useEffect } from 'react'
import { divIcon } from 'leaflet'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'

export const BALTIMORE: [number, number] = [39.2904, -76.6122]

/**
 * A divIcon, matching how MapView draws its pins — the dot is a styled
 * <span>, not an image. Leaflet's default marker is a PNG it locates at
 * runtime, which does not survive Vite's asset handling; sidestepping it is
 * simpler than patching the lookup.
 *
 * Built once at module scope, and the HTML is a constant. Per MapView's note:
 * **this string is not escaped**, so nothing user-controlled may ever go in it.
 */
const dropPin = divIcon({
  className: '',
  html: '<span class="pin-new"></span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

/** Clicking the map moves the pin. Dropping a pin beats typing coordinates. */
function ClickToMove({
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
  return <Marker position={position} icon={dropPin} />
}

/**
 * Recentre the map when the pin is moved from outside — by a geocoded address,
 * say. Only on a deliberate move: panning to follow every click would fight
 * the person dragging the map.
 */
function Recentre({ position, token }: { position: [number, number]; token: number }) {
  const map = useMap()
  useEffect(() => {
    if (token > 0) map.setView(position, Math.max(map.getZoom(), 15))
    // Keyed to the token alone, deliberately. Following `position` would pan
    // the map out from under anyone clicking to move the pin by hand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])
  return null
}

/**
 * The shared location picker: a small map with one movable pin.
 *
 * Extracted from PostForm so the donor profile can use the same control. A
 * restaurant sets its location once here and the post form inherits it.
 */
export default function MapPicker({
  position,
  onPick,
  recentreToken = 0,
}: {
  position: [number, number]
  onPick: (p: [number, number]) => void
  /** Bump to pan the map to `position`. Ignored while 0. */
  recentreToken?: number
}) {
  return (
    <div className="post__map">
      <MapContainer center={position} zoom={12} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <ClickToMove position={position} onPick={onPick} />
        <Recentre position={position} token={recentreToken} />
      </MapContainer>
    </div>
  )
}
