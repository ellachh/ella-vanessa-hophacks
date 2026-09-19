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
 * A live feed of every claim attempt on the board — won and lost.
 *
 * Without this, only the loser learns they lost, through their own rejected
 * promise. The event table broadcasts attempts to everyone, so contention stops
 * being a moment we have to stage for the demo and becomes something the board
 * visibly does.
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
    <div className="feed" role="log" aria-live="polite" aria-label="Claim activity">
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
