/** A plausible email address, lower-cased, or null. Deliberately simple: the real test is whether mail arrives. */
export function parseSubscriberEmail(raw: unknown): string | null {
  const e = (typeof raw === 'string' ? raw : '').trim().toLowerCase()
  return e.length <= 254 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,24}$/.test(e) && !e.includes('..') ? e : null
}
