import type { Timestamp } from 'spacetimedb'

export type Urgency = 'overdue' | 'soon' | 'ok'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Anything inside this window is worth flagging visually. */
export const SOON_MS = HOUR

/**
 * `now` is a parameter rather than being read inside, so this is a pure
 * function of its inputs and can be tested without freezing the clock.
 */
export function msUntil(pickupBy: Timestamp, now: Date = new Date()): number {
  return pickupBy.toDate().getTime() - now.getTime()
}

export function urgencyOf(pickupBy: Timestamp, now: Date = new Date()): Urgency {
  const ms = msUntil(pickupBy, now)
  if (ms <= 0) return 'overdue'
  if (ms < SOON_MS) return 'soon'
  return 'ok'
}

/**
 * A driver deciding whether to take a pickup cares how long they have, not
 * what the wall-clock deadline is. "40m left" is actionable; "5:59 PM"
 * requires arithmetic.
 */
export function timeLeft(pickupBy: Timestamp, now: Date = new Date()): string {
  const ms = msUntil(pickupBy, now)
  if (ms <= 0) return 'Past pickup time'

  if (ms < HOUR) return `${Math.max(1, Math.floor(ms / MINUTE))}m left`

  if (ms < DAY) {
    const h = Math.floor(ms / HOUR)
    const m = Math.floor((ms % HOUR) / MINUTE)
    return m === 0 ? `${h}h left` : `${h}h ${m}m left`
  }

  const d = Math.floor(ms / DAY)
  return `${d}d left`
}

/** The absolute deadline, for the detail panel where there is room for both. */
export function pickupClock(pickupBy: Timestamp): string {
  return pickupBy.toDate().toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}
