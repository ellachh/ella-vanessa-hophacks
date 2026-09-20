import { useState } from 'react'
import { useReducer } from 'spacetimedb/react'

import type { Identity } from 'spacetimedb'

import { sameIdentity } from './identity'
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
 * **The winning claim is left held**, deliberately. An earlier version released
 * it the instant the run finished, which kept repeated rehearsals cheap and
 * destroyed the only thing worth showing: a judge cannot check the other
 * laptop, read the log, or `spacetime sql` the row if the state evaporates
 * before they look. The tally is the claim; the held row is the evidence.
 *
 * Releasing is a second, explicit press. Two reasons it has to be:
 *
 *  - Firing again while we already hold this listing would return 50 rejections
 *    and zero winners, because `claim_listing` sees `claimed_by` is set and
 *    does not care that it is set to us. That reads as a broken demo.
 *  - Each held listing counts against the module's 3-claim ceiling, so runs
 *    left unreleased eventually fail for a reason that has nothing to do with
 *    contention.
 *
 * So the primary action swaps: hold → Release, released → Fire. Held state is
 * read from the live row rather than remembered locally, so releasing from the
 * panel above, or from the other laptop, is reflected here too.
 */
export default function StressTest({
  listing,
  me,
}: {
  listing: Listing
  me: Identity | undefined
}) {
  const claim = useReducer(reducers.claimListing)
  const unclaim = useReducer(reducers.unclaimListing)
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [run, setRun] = useState<Run | null>(null)

  const heldByMe = sameIdentity(listing.claimedBy, me)

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

    // The claim stays held. That is the point — see the note above.
    setRun({
      fired: FIRE,
      won,
      rejected: FIRE - won,
      ms,
      reasons: [...tally.entries()]
        .map(([text, count]) => ({ text, count }))
        .sort((a, b) => b.count - a.count),
    })
    setRunning(false)
  }

  async function release() {
    setReleasing(true)
    try {
      await unclaim({ id: listing.id })
    } catch {
      // Someone else changed the row under us. The tally on screen is still
      // an accurate record of the run that produced it, so it stays.
    } finally {
      setReleasing(false)
    }
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
      {heldByMe ? (
        <button className="btn" disabled={releasing} onClick={release}>
          {releasing ? 'Releasing…' : 'Release it'}
        </button>
      ) : (
        <button className="btn btn--primary" disabled={running} onClick={fire}>
          {running ? `Firing ${FIRE}…` : `Fire ${FIRE} simultaneous claims`}
        </button>
      )}

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
                ? `Already claimed — all ${run.fired} refused. ${run.ms}ms.`
                : `${run.won} winners — that should be impossible. Investigate.`}
          </p>
          {run.reasons.map((r) => (
            <p key={r.text} className="stress__reason">
              <span className="stress__num">{r.count}×</span> {r.text}
            </p>
          ))}
          {heldByMe && (
            <p className="stress__held">
              Still held. Check the other laptop, the module log, or
              <code> spacetime sql food-pickup</code> — the row is really there.
              Release when you are done looking.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
