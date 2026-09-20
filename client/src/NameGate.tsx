import { useState } from 'react'
import { useReducer } from 'spacetimedb/react'

import { reducers } from './module_bindings'

/**
 * First-load name entry. The user table exists only so the board can say
 * "Vanessa claimed this" instead of a hex identity — which is also what makes
 * the claim-race toast readable.
 */
export default function NameGate({ onDone }: { onDone: () => void }) {
  // Writes a row into the user table keyed on this client's identity.
  const setName = useReducer(reducers.setName)

  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // On success App swaps this gate out for the board. On failure the message
  // stays on the card rather than becoming a toast, because there is nothing
  // behind the gate to read it against yet.
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await setName({ name: value })
      onDone()
    } catch (err) {
      // The module owns the rules; show exactly what it said.
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="gate">
      <form className="gate__card" onSubmit={submit}>
        <h1 className="gate__title">Scraps</h1>
        <p className="gate__sub">Baltimore food rescue board</p>
        <label className="gate__label" htmlFor="name">
          What should we call you?
        </label>
        <input
          id="name"
          className="gate__input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Name"
          autoFocus
        />
        {error && <p className="gate__error">{error}</p>}
        <button className="btn btn--primary" disabled={busy || !value.trim()}>
          {busy ? 'Joining…' : 'Start'}
        </button>
      </form>
    </div>
  )
}
