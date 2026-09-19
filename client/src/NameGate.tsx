import { useState } from 'react'
import { useReducer } from 'spacetimedb/react'

import { reducers } from './module_bindings'

/**
 * First-load name entry. The user table exists only so the board can say
 * "Vanessa claimed this" instead of a hex identity — which is also what makes
 * the claim-race toast readable.
 */
export default function NameGate({ onDone }: { onDone: () => void }) {
  const setName = useReducer(reducers.setName)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
        <p className="gate__sub">Live food rescue board — Baltimore</p>
        <label className="gate__label" htmlFor="name">
          What should volunteers call you?
        </label>
        <input
          id="name"
          className="gate__input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Vanessa"
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
