/** Pure rules for incoming courier webhooks (no database): who may call, and how big a body we accept. */
import { timingSafeEqual } from 'node:crypto'

export const MAX_WEBHOOK_BYTES = 50_000

/** Constant-time comparison, so the key cannot be guessed one character at a time. */
export function keysMatch(given: string | null | undefined, expected: string): boolean {
  if (!given) return false
  const a = Buffer.from(given), b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** The key the courier sent: in the URL (?key=...), or as a header (x-webhook-key / Authorization: Bearer ...). */
export function extractKey(url: string, headers: { get(name: string): string | null }): string | null {
  const fromHeader = headers.get('x-webhook-key') ?? headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null
  if (fromHeader) return fromHeader.trim()
  try { return new URL(url, 'http://x').searchParams.get('key') } catch { return null }
}

/** Tenant ids are generated ids: reject anything else before touching the database. */
export const isPlausibleTenantId = (v: string) => /^[A-Za-z0-9_-]{10,40}$/.test(v)
