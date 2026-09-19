/**
 * Restores Leaflet's default marker icon under Vite.
 *
 * Leaflet finds its icon images at runtime by reading the background-image of
 * `.leaflet-default-icon-path` and stripping `marker-icon.png` off the end to
 * recover the directory. Vite inlines those small PNGs as base64 `data:` URIs,
 * so that strip finds nothing, the image path resolves to an empty string, and
 * every marker requests a bare `marker-icon.png` that does not exist.
 *
 * It fails *only in the production build* — `npm run dev` serves the stylesheet
 * unhashed, so the detection works and markers look fine right up until you
 * build for the demo. There is no 404 in the console either: the static server
 * answers unknown paths with index.html and a 200, so the browser just fails to
 * decode HTML as an image.
 *
 * Importing the URLs explicitly hands Vite the asset references it can rewrite.
 * Import this module once, before any <Marker> renders.
 */
import { Icon } from 'leaflet'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'

Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl })
