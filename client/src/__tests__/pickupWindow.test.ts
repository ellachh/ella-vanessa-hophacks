import { describe, expect, it } from 'vitest'
import { Timestamp } from 'spacetimedb'

import { msUntil, pickupClock, timeLeft, urgencyOf } from '../pickupWindow'

const NOW = new Date('2026-09-19T12:00:00Z')
const at = (ms: number) => Timestamp.fromDate(new Date(NOW.getTime() + ms))

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('msUntil', () => {
  it('is positive in the future and negative in the past', () => {
    expect(msUntil(at(5 * MIN), NOW)).toBe(5 * MIN)
    expect(msUntil(at(-5 * MIN), NOW)).toBe(-5 * MIN)
  })
})

describe('timeLeft', () => {
  it('reports minutes under an hour', () => {
    expect(timeLeft(at(45 * MIN), NOW)).toBe('45m left')
  })

  it('rounds sub-minute up to 1m rather than showing 0m', () => {
    expect(timeLeft(at(30_000), NOW)).toBe('1m left')
  })

  it('reports hours and minutes under a day', () => {
    expect(timeLeft(at(2 * HOUR + 15 * MIN), NOW)).toBe('2h 15m left')
  })

  it('omits minutes on a whole hour', () => {
    expect(timeLeft(at(3 * HOUR), NOW)).toBe('3h left')
  })

  it('reports days beyond 24h', () => {
    expect(timeLeft(at(2 * DAY + 3 * HOUR), NOW)).toBe('2d left')
  })

  it('says past pickup time once the deadline has gone', () => {
    expect(timeLeft(at(-1 * MIN), NOW)).toBe('Past pickup time')
  })

  it('treats the exact deadline as past, not as 0m left', () => {
    expect(timeLeft(at(0), NOW)).toBe('Past pickup time')
  })
})

describe('urgencyOf', () => {
  it('flags overdue, soon and ok', () => {
    expect(urgencyOf(at(-1), NOW)).toBe('overdue')
    expect(urgencyOf(at(30 * MIN), NOW)).toBe('soon')
    expect(urgencyOf(at(5 * HOUR), NOW)).toBe('ok')
  })

  it('treats exactly one hour as ok, not soon', () => {
    expect(urgencyOf(at(HOUR), NOW)).toBe('ok')
    expect(urgencyOf(at(HOUR - 1), NOW)).toBe('soon')
  })
})

describe('pickupClock', () => {
  it('returns a wall-clock time', () => {
    expect(pickupClock(at(0))).toMatch(/\d{1,2}:\d{2}/)
  })
})
