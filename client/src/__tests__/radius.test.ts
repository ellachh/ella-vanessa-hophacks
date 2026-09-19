import { describe, expect, it } from 'vitest'

import { DEFAULT_CENTER as C, milesFrom, withinRadius } from '../radius'

describe('milesFrom', () => {
  it('is zero at the centre', () => {
    expect(milesFrom(C, { lat: C[0], lng: C[1] })).toBeCloseTo(0, 5)
  })

  it('matches a known Baltimore distance', () => {
    // Downtown to Roland Park is roughly 4.4 miles.
    const d = milesFrom(C, { lat: 39.352, lng: -76.632 })
    expect(d).toBeGreaterThan(4)
    expect(d).toBeLessThan(5)
  })

  it('is symmetric in sign', () => {
    const north = milesFrom(C, { lat: C[0] + 0.05, lng: C[1] })
    const south = milesFrom(C, { lat: C[0] - 0.05, lng: C[1] })
    expect(north).toBeCloseTo(south, 6)
  })
})

describe('withinRadius', () => {
  it('admits everything when no radius is set', () => {
    expect(withinRadius(C, { lat: 0, lng: 0 }, null)).toBe(true)
  })

  it('excludes a listing outside the circle', () => {
    // Roland Park (~4.4mi) is outside a 3-mile radius.
    expect(withinRadius(C, { lat: 39.352, lng: -76.632 }, 3)).toBe(false)
  })

  it('includes a listing inside the circle', () => {
    expect(withinRadius(C, { lat: 39.352, lng: -76.632 }, 5)).toBe(true)
  })

  it('trims the bounding-box corners', () => {
    // A point diagonally out at both edges of a 1-mile box is ~1.41mi away,
    // so the box would admit it and the circle must not. This is the whole
    // reason the client-side pass exists.
    const corner = { lat: C[0] + 1 / 69, lng: C[1] + 1 / 53.4 }
    expect(milesFrom(C, corner)).toBeGreaterThan(1)
    expect(withinRadius(C, corner, 1)).toBe(false)
  })
})

describe('moving the volunteer', () => {
  it('measures from wherever the pin is, not from downtown', () => {
    const rolandPark: [number, number] = [39.352, -76.632]
    const listing = { lat: 39.352, lng: -76.632 }
    // Out of range from downtown...
    expect(withinRadius(C, listing, 3)).toBe(false)
    // ...and on top of you once you drag the pin there.
    expect(withinRadius(rolandPark, listing, 1)).toBe(true)
  })
})
