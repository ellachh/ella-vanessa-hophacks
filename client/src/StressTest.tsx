import { useState } from 'react'
import { useReducer } from 'spacetimedb/react'

import { reducers } from './module_bindings'
import type { Listing } from './module_bindings/types'

/** Enough to be obviously concurrent, small enough to finish while someone watches. */
const FIRE = 50

type Run = {
  fired: number
  won: number
  rejected: number
  ms: number
  reasons: { text: string; count: number }[]
  released: boolean
}

/**
 * Fires many claims at one listing at once and reports the tally.
 *
 * Two people tapping is an anecdote. Fifty in-flight calls resolving to exactly
 * one winner is a demonstrated guarantee, and a judge can press the button
 * themselves.
 *
 * Every call carries OUR identity, so the 49 rejections say "Vanessa claimed
 * this first" — addressed to Vanessa. That is why this reports counts rather
 * than the messages: the claim is "one write succeeded", not who won.
 *
 * It releases the claim afterwards. Without that, each run leaves another held
 * listing and repeated runs hit the module's 3-claim ceiling — failing for a
 * reason that has nothing to do with contention, which would look like a bug
 * mid-demo.
 */
export default function StressTest({ listing }: { listing: Listing }) {
  const claim = useReducer(reducers.claimListing)
  const unclaim = useReducer(reducers.unclaimListing)
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [run, setRun] = useState<Run | null>(null)

  async function fire() {
    setRunning(true)
    setRun(null)

    const started = performance.now()
    // All FIRE calls go out before any resolves — that is what makes this
    // contention rather than a loop.
    const settled = await Promise.allSettled(
      Array.from({ length: FIRE }, () => claim({ id: listing.id })),
    )
    const ms = Math.round(performance.now() - started)

    const won = settled.filter((s) => s.status === 'fulfilled').length
    const tally = new Map<string, number>()
    for (const s of settled) {
      if (s.status !== 'rejected') continue
      const text = s.reason instanceof Error ? s.reason.message : String(s.reason)
      tally.set(text, (tally.get(text) ?? 0) + 1)
    }

    let released = false
    if (won > 0) {
      try {
        await unclaim({ id: listing.id })
        released = true
      } catch {
        // Someone else's state changed under us; the tally is still valid.
      }
    }

    setRun({
      fired: FIRE,
      won,
      rejected: FIRE - won,
      ms,
      reasons: [...tally.entries()]
        .map(([text, count]) => ({ text, count }))
        .sort((a, b) => b.count - a.count),
      released,
    })
    setRunning(false)
  }

  if (!open) {
    return (
      <button className="stress__reveal" onClick={() => setOpen(true)}>
        Prove the race →
      </button>
    )
  }

  return (
    <section className="stress">
      <p className="stress__lead">
        Fires {FIRE} claims at this listing at once. Exactly one can win.
      </p>
      <button className="btn btn--primary" disabled={running} onClick={fire}>
        {running ? `Firing ${FIRE}…` : `Fire ${FIRE} simultaneous claims`}
      </button>

      {run && (
        <div className="stress__result">
          <div className="stress__tally">
            <span className="stress__num">{run.fired}</span> fired ·{' '}
            <span className="stress__num stress__num--won">{run.won}</span> succeeded ·{' '}
            <span className="stress__num">{run.rejected}</span> rejected
          </div>
          <p className="stress__verdict">
            {run.won === 1
              ? `One write survived. No locks, no retries, no double-claim. ${run.ms}ms.`
              : run.won === 0
                ? `Already held by someone else — all ${run.fired} refused. ${run.ms}ms.`
                : `${run.won} winners — that should be impossible. Investigate.`}
          </p>
          {run.reasons.map((r) => (
            <p key={r.text} className="stress__reason">
              <span className="stress__num">{r.count}×</span> {r.text}
            </p>
          ))}
          {run.released && <p className="stress__reason">Claim released — run it again.</p>}
        </div>
      )}
    </section>
  )
}
