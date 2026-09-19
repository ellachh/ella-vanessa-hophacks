import type { Identity } from 'spacetimedb'

/** Identity is a class, so `===` compares references and is always false. */
export function sameIdentity(
  a: Identity | null | undefined,
  b: Identity | null | undefined,
): boolean {
  if (!a || !b) return false
  return a.isEqual(b)
}
