// Tests for identity.ts and listing.ts — the two bits of logic the board reads
// on every render.
//
// sameIdentity exists because Identity is a class, so `===` compares object
// references and is false even for the same user. listingState decides whether
// a pin draws open, yours or taken. isPlottable rejects coordinates that would
// break the map for everyone, not just for whoever posted them.

import { describe, expect, it } from 'vitest'
import { Identity, Timestamp } from 'spacetimedb'

import { sameIdentity } from '../identity'
import { isPlottable, listingState } from '../listing'
import type { Listing } from '../module_bindings/types'

const me = Identity.fromString('11'.repeat(32))
const ella = Identity.fromString('22'.repeat(32))
/** Same value, different object — the case `===` gets wrong. */
const meAgain = Identity.fromString('11'.repeat(32))

const listing = (over: Partial<Listing> = {}): Listing => ({
  id: 1n,
  donor: 'Pratt Street Bakehouse',
  description: 'Bagels',
  pickupBy: Timestamp.fromDate(new Date()),
  lat: 39.2904,
  lng: -76.6122,
  postedBy: ella,
  claimedBy: undefined,
  completed: false,
  ...over,
})

describe('sameIdentity', () => {
  it('matches equal identities held in different objects', () => {
    expect(sameIdentity(me, meAgain)).toBe(true)
    // The bug this guards: reference equality is false for equal identities.
    expect(me === meAgain).toBe(false)
  })

  it('rejects different identities', () => {
    expect(sameIdentity(me, ella)).toBe(false)
  })

  it('treats missing identities as not matching', () => {
    expect(sameIdentity(undefined, me)).toBe(false)
    expect(sameIdentity(me, undefined)).toBe(false)
    expect(sameIdentity(null, null)).toBe(false)
  })
})

describe('isPlottable — guards the whole board, not one screen', () => {
  it('accepts real Baltimore coordinates', () => {
    expect(isPlottable(listing())).toBe(true)
  })

  it('rejects NaN, which fails every comparison and would slip a range check', () => {
    expect(isPlottable(listing({ lat: NaN }))).toBe(false)
    expect(isPlottable(listing({ lng: NaN }))).toBe(false)
  })

  it('rejects infinities', () => {
    expect(isPlottable(listing({ lat: Infinity }))).toBe(false)
    expect(isPlottable(listing({ lng: -Infinity }))).toBe(false)
  })

  it('rejects out-of-range coordinates', () => {
    expect(isPlottable(listing({ lat: 91 }))).toBe(false)
    expect(isPlottable(listing({ lat: -91 }))).toBe(false)
    expect(isPlottable(listing({ lng: 181 }))).toBe(false)
    expect(isPlottable(listing({ lng: -181 }))).toBe(false)
  })

  it('accepts the exact boundaries', () => {
    expect(isPlottable(listing({ lat: 90, lng: 180 }))).toBe(true)
    expect(isPlottable(listing({ lat: -90, lng: -180 }))).toBe(true)
  })

  it('accepts null island rather than mistaking 0 for missing', () => {
    expect(isPlottable(listing({ lat: 0, lng: 0 }))).toBe(true)
  })
})

describe('listingState', () => {
  it('is open when nobody holds it', () => {
    expect(listingState(listing(), me)).toBe('open')
  })

  it('is mine when I hold it, even across object identity', () => {
    expect(listingState(listing({ claimedBy: meAgain }), me)).toBe('mine')
  })

  it('is taken when someone else holds it', () => {
    expect(listingState(listing({ claimedBy: ella }), me)).toBe('taken')
  })

  it('is taken, not mine, when our own identity is not yet known', () => {
    // Guards against an unconnected client rendering every pin as its own.
    expect(listingState(listing({ claimedBy: ella }), undefined)).toBe('taken')
  })
})
