/**
 * ERROR MONITORING: the rules (pure). When a page crashes, a short, safe note is kept for the platform owner:
 * which kind of page, what the error said, how often. Never customer data, never secrets.
 */
import { createHash } from 'node:crypto'

/** "/product/sidr-honey-500g" -> "/product/[…]": errors are grouped by KIND of page, and no product or order name is kept. */
export function pageKind(path: unknown): string {
  const p = (typeof path === 'string' ? path : '').split(/[?#]/)[0].slice(0, 200)
  if (!p.startsWith('/')) return '/'
  const parts = p.split('/'), keep = ['admin', 'csmi', 'api'].includes(parts[1]) ? 3 : 2 // dashboards and APIs keep one more level
  return parts.map((seg, i) => (i >= keep && seg && !['new', 'slips', 'export', 'success', 'subscribers', 'receipt', 'check-email', 'pending', 'verify'].includes(seg) ? '[…]' : seg.replace(/[^a-zA-Z0-9()_.-]/g, '').slice(0, 40))).join('/') || '/'
}
/** The error's own words, shortened, with anything that looks like a secret, an address or a phone number removed. */
export function safeMessage(raw: unknown): string {
  return String(raw ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[address]')
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[email]')
    .replace(/(?:\+?92|0)3\d{2}[\s-]?\d{7}\b/g, '[phone]')
    .replace(/\b[A-Za-z0-9_\-]{32,}\b/g, '[key]')
    .replace(/\s+/g, ' ').trim().slice(0, 300) || 'Unknown error'
}
export const errorFingerprint = (kind: string, path: string, message: string) => createHash('sha256').update(`${kind}|${path}|${message}`).digest('hex').slice(0, 32)
/** Errors that are part of normal operation and not worth a line (a page that does not exist, a redirect). */
export const isNoise = (message: string, digest?: string | null) => /^NEXT_(NOT_FOUND|REDIRECT)/.test(digest ?? '') || /NEXT_NOT_FOUND|NEXT_REDIRECT|aborted|AbortError/i.test(message)
export const ERROR_KEEP_DAYS = 30
