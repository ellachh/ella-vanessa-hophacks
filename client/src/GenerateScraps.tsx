import { useState } from 'react'
import { useReducer } from 'spacetimedb/react'

import { reducers } from './module_bindings'
import './GenerateScraps.css'

/**
 * Wipes the board and lays down fifteen fresh pickups with windows measured
 * from now. Saves a trip to the terminal between rehearsals.
 *
 * **Only rendered where it is safe to.** Everyone on the deployed link shares
 * one database, so a stranger pressing this mid-demo would clear the board
 * under us. It shows on localhost, and on any other origin only when the URL
 * carries `#host` — so our laptops always have it and the public link never
 * does unless we ask for it.
 */
export function canGenerate(): boolean {
  if (typeof window === 'undefined') return false
  const local =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  return local || window.location.hash === '#host'
}

export default function GenerateScraps({ onError }: { onError: (message: string) => void }) {
  const reset = useReducer(reducers.resetBoard)
  const [busy, setBusy] = useState(false)

  if (!canGenerate()) return null

  async function generate() {
    if (busy) return
    setBusy(true)
    try {
      // A reducer with no parameters takes no argument — not an empty object.
      await reset()
      // Nothing to update locally. The rows change on the server and every
      // open board re-renders — including the other laptop.
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className="btn generate"
      onClick={generate}
      disabled={busy}
      title="Wipe the board and seed fifteen fresh pickups"
    >
      {busy ? 'Generating…' : 'Generate scraps'}
    </button>
  )
}
