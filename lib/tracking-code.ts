import { randomInt } from 'node:crypto'

// No 0/O, 1/I/L: codes are read aloud and typed from SMS, so avoid look-alikes.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const chunk = (n: number) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')

/** e.g. "MP-7K4Q-9XMD": 8 random characters (about 40 bits), unguessable and not sequential. */
export function generateTrackingCode(storeSlug: string): string {
  const prefix = storeSlug.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase().padEnd(2, 'X')
  return `${prefix}-${chunk(4)}-${chunk(4)}`
}

/** Accepts what people actually type ("mp 7k4q 9xmd") and returns the canonical form, or null. */
export function normalizeTrackingCode(input: string): string | null {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (clean.length !== 10) return null
  return `${clean.slice(0, 2)}-${clean.slice(2, 6)}-${clean.slice(6)}`
}
