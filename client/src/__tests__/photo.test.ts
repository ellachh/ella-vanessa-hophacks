// Tests for photo.ts, the browser-side shrinking that runs before a photo is
// uploaded.
//
// Only the pure parts are covered: the sizing arithmetic, and the two checks
// that decide whether a data URI is storable. The canvas encode needs a real
// browser, so it is exercised by hand rather than here.

import { describe, expect, it } from 'vitest'

import { MAX_PHOTO_CHARS, fitWithin, isAcceptedType, isWithinCap } from '../photo'

describe('fitWithin', () => {
  it('leaves an image that already fits alone', () => {
    expect(fitWithin(640, 480, 720)).toEqual({ width: 640, height: 480 })
  })

  it('scales the longest edge down to the cap', () => {
    expect(fitWithin(4032, 3024, 720)).toEqual({ width: 720, height: 540 })
  })

  it('treats height as the longest edge when the photo is portrait', () => {
    expect(fitWithin(3024, 4032, 720)).toEqual({ width: 540, height: 720 })
  })

  it('preserves aspect ratio to within a rounded pixel', () => {
    const { width, height } = fitWithin(1999, 1001, 720)
    expect(Math.abs(width / height - 1999 / 1001)).toBeLessThan(0.01)
  })

  it('never rounds a very thin image down to a zero edge', () => {
    // A panorama: 8000x3 would scale its short edge to 0.27px.
    const { width, height } = fitWithin(8000, 3, 720)
    expect(width).toBe(720)
    expect(height).toBe(1)
  })

  it('refuses sizes that would make a canvas throw', () => {
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(100, -1)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(Number.NaN, 100)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(Number.POSITIVE_INFINITY, 100)).toEqual({ width: 0, height: 0 })
  })
})

describe('isWithinCap', () => {
  it('rejects an empty string — there is no photo to store', () => {
    expect(isWithinCap('')).toBe(false)
  })

  it('accepts a string exactly at the cap', () => {
    expect(isWithinCap('x'.repeat(MAX_PHOTO_CHARS))).toBe(true)
  })

  it('rejects one character over', () => {
    expect(isWithinCap('x'.repeat(MAX_PHOTO_CHARS + 1))).toBe(false)
  })
})

describe('isAcceptedType', () => {
  it('accepts what the module stores', () => {
    expect(isAcceptedType('image/jpeg')).toBe(true)
    expect(isAcceptedType('image/png')).toBe(true)
    expect(isAcceptedType('image/webp')).toBe(true)
  })

  it('rejects anything else, including formats a browser would happily render', () => {
    expect(isAcceptedType('image/svg+xml')).toBe(false)
    expect(isAcceptedType('image/gif')).toBe(false)
    expect(isAcceptedType('application/pdf')).toBe(false)
    expect(isAcceptedType('')).toBe(false)
  })
})
