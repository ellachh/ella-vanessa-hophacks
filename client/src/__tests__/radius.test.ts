import { describe, expect, it } from 'vitest'

import { CENTER, milesFromCenter, withinRadius } from '../radius'

describe('milesFromCenter', () => {
  it('is zero at the centre', () => {
    expect(milesFromCenter({ lat: CENTER[0], lng: CENTER[1] })).toBeCloseTo(0, 5)
  })

  it('matches a known Baltimore distance', () => {
    // Downtown to Roland Park is roughly 4.4 miles.
    const d = milesFromCenter({ lat: 39.352, lng: -76.632 })
    expect(d).toBeGreaterThan(4)
    expect(d).toBeLessThan(5)
  })

  it('is symmetric in sign', () => {
    const north = milesFromCenter({ lat: CENTER[0] + 0.05, lng: CENTER[1] })
    const south = milesFromCenter({ lat: CENTER[0] - 0.05, lng: CENTER[1] })
    expect(north).toBeCloseTo(south, 6)
  })
})

describe('withinRadius', () => {
  it('admits everything when no radius is set', () => {
    expect(withinRadius({ lat: 0, lng: 0 }, null)).toBe(true)
  })

  it('excludes a listing outside the circle', () => {
    // Roland Park (~4.4mi) is outside a 3-mile radius.
    expect(withinRadius({ lat: 39.352, lng: -76.632 }, 3)).toBe(false)
  })

  it('includes a listing inside the circle', () => {
    expect(withinRadius({ lat: 39.352, lng: -76.632 }, 5)).toBe(true)
  })

  it('trims the bounding-box corners', () => {
    // A point diagonally out at both edges of a 1-mile box is ~1.41mi away,
    // so the box would admit it and the circle must not. This is the whole
    // reason the client-side pass exists.
    const corner = { lat: CENTER[0] + 1 / 69, lng: CENTER[1] + 1 / 53.4 }
    expect(milesFromCenter(corner)).toBeGreaterThan(1)
    expect(withinRadius(corner, 1)).toBe(false)
  })
})
