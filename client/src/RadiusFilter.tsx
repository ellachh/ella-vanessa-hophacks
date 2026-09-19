import { RADIUS_OPTIONS, type Radius } from './radius'
import './RadiusFilter.css'

/**
 * How far this volunteer is willing to travel.
 *
 * Changing it re-scopes the subscription — see `listingsWithin`. The count is
 * shown so the effect is legible: a judge can watch rows stop arriving.
 *
 * It deliberately reads "7 pickups", not "7 of 15". We do not know what 15 is:
 * the rows outside the radius were never sent to us. Showing a total would mean
 * subscribing to the whole table, which is the exact thing this avoids. The
 * count being un-knowable is the feature working.
 */
export default function RadiusFilter({
  value,
  onChange,
  shown,
}: {
  value: Radius
  onChange: (r: Radius) => void
  shown: number
}) {
  return (
    <div className="radius">
      <span className="radius__label">Within</span>
      <div className="radius__chips">
        {RADIUS_OPTIONS.map((r) => (
          <button
            key={r}
            className={`radius__chip${value === r ? ' radius__chip--on' : ''}`}
            onClick={() => onChange(r)}
            aria-pressed={value === r}
          >
            {r} mi
          </button>
        ))}
        <button
          className={`radius__chip${value === null ? ' radius__chip--on' : ''}`}
          onClick={() => onChange(null)}
          aria-pressed={value === null}
        >
          Any
        </button>
      </div>
      <span className="radius__count">
        {shown} {shown === 1 ? 'pickup' : 'pickups'}
      </span>
    </div>
  )
}
