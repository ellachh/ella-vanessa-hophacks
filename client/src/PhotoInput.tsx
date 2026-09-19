import { useRef, useState } from 'react'

import { downscaleToDataUri } from './photo'

/**
 * Pick or take a photo of the food, downscaled in the browser before it is
 * ever sent.
 *
 * `capture="environment"` makes a phone open the rear camera directly instead
 * of the photo library, which is the actual gesture a restaurant makes: they
 * are standing in front of the tray.
 *
 * The preview is an `<img src>` bound to a data URI produced by our own canvas
 * — not to anything that arrived over the network — so there is no path here
 * for someone else's string to become markup.
 */
export default function PhotoInput({
  value,
  onChange,
  onError,
}: {
  value: string
  onChange: (dataUri: string) => void
  onError: (message: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [working, setWorking] = useState(false)

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Let the same file be chosen twice in a row: without this, re-picking
    // after a removal fires no change event.
    e.target.value = ''
    if (!file) return

    setWorking(true)
    try {
      onChange(await downscaleToDataUri(file))
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="photo">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="photo__file"
        onChange={pick}
      />

      {value ? (
        <div className="photo__has">
          <img className="photo__preview" src={value} alt="The food you are posting" />
          <div className="photo__buttons">
            <button type="button" className="btn btn--small" onClick={() => input.current?.click()}>
              Replace
            </button>
            <button type="button" className="btn btn--small" onClick={() => onChange('')}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="photo__drop"
          onClick={() => input.current?.click()}
          disabled={working}
        >
          {working ? 'Resizing…' : 'Add a photo'}
          <span className="photo__hint">
            {working ? 'One moment' : 'Volunteers claim pickups they can see'}
          </span>
        </button>
      )}
    </div>
  )
}
