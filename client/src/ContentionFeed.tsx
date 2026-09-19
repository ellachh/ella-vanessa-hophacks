import { useCallback, useEffect, useRef, useState } from 'react'
import { useTable } from 'spacetimedb/react'

import { sameIdentity } from './identity'
import { tables } from './module_bindings'
import type { User } from './module_bindings/types'

/** The stress test fires 50 at once, so this has to be capped, not a log. */
const MAX_VISIBLE = 5
const LINGER_MS = 6000

type Entry = { key: number; who: string; listingId: bigint; won: boolean }

/**
 * A live feed of successful claims across the board.
 *
 * It was designed to show attempts won AND lost, which would have made
 * contention visible to everyone rather than only to the loser. It cannot:
 * Ella verified against Maincloud that a reducer returning `Err` aborts its
 * transaction, and `record_attempt`'s insert goes with it. Losing rows never
 * persist, so only winners ever arrive here. See PLAN.md.
 *
 * Recovering the losses would mean returning `Ok` on every path and putting
 * the outcome in the row, which costs the rejection message on the loser's
 * screen — the clearest thing in the demo. Not worth the trade.
 *
 * The `--lost` styling stays. It is dormant, costs nothing, and works
 * unchanged if that trade is ever made.
 *
 * Event-table rows are NEVER stored in the client cache — `count()` is 0 and
 * `iter()` yields nothing. The only way to see them is the `onInsert`
 * callback, so this keeps its own capped list rather than rendering rows.
 */
export default function ContentionFeed({ users }: { users: readonly User[] }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const seq = useRef(0)

  // The onInsert closure is created once; without this it would keep resolving
  // names against whatever `users` looked like on first render.
  const usersRef = useRef(users)
  useEffect(() => {
    usersRef.current = users
  }, [users])

  const onInsert = useCallback((row: { listingId: bigint; who: unknown; won: boolean }) => {
    const name =
      usersRef.current.find((u) => sameIdentity(u.identity, row.who as never))?.name ??
      'Someone'
    setEntries((prev) =>
      [{ key: seq.current++, who: name, listingId: row.listingId, won: row.won }, ...prev].slice(
        0,
        MAX_VISIBLE,
      ),
    )
  }, [])

  useTable(tables.claimAttempt, { onInsert })

  // Clear the feed once it goes quiet, so a stale burst is not still sitting
  // there minutes later looking like live activity.
  useEffect(() => {
    if (entries.length === 0) return
    const t = setTimeout(() => setEntries([]), LINGER_MS)
    return () => clearTimeout(t)
  }, [entries])

  if (entries.length === 0) return null

  return (
    <div className="feed" role="log" aria-live="polite" aria-label="Recent claims">
      {entries.map((e) => (
        <p key={e.key} className={`feed__row feed__row--${e.won ? 'won' : 'lost'}`}>
          <span className="feed__who">{e.who}</span>{' '}
          {e.won ? 'took' : 'missed'}{' '}
          <span className="feed__id">#{String(e.listingId)}</span>
        </p>
      ))}
    </div>
  )
}
