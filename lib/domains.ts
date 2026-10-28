/**
 * Web addresses (domains) for stores. Pure functions, so every rule is unit-tested.
 * A customer visiting shop.example.pk reaches the store whose address is shop.example.pk.
 */

/** Lower-case host without port or trailing dot; null if it is not a plausible host name. Takes the first of a "a, b" list. */
export function normalizeHost(raw: string | null | undefined): string | null {
  if (!raw) return null
  let h = raw.split(',')[0].trim().toLowerCase()
  if (h.startsWith('[')) return null // IPv6 literal: never a store address
  h = h.replace(/:\d{1,5}$/, '').replace(/\.$/, '')
  return h && h.length <= 253 ? h : null
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/

/**
 * A public domain name a store owner could really own: at least two labels, letters/digits/dashes only,
 * a letters-only ending (".pk", ".com.pk", ".store"), and not an IP address or an internal name.
 */
export function isValidDomain(host: string): boolean {
  if (host.length < 4 || host.length > 253) return false
  const labels = host.split('.')
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return false
  const tld = labels[labels.length - 1]
  if (!/^(?:[a-z]{2,24}|xn--[a-z0-9-]{2,50})$/.test(tld)) return false // also rules out 127.0.0.1 and 10.0.0.5
  if (['localhost', 'local', 'internal', 'lan', 'home', 'test', 'invalid', 'example'].includes(tld)) return false
  return true
}

/** Hosts to try for a visitor: the exact address first, then the same without "www." (so www.shop.pk works when shop.pk is added). */
export function hostCandidates(host: string): string[] {
  return host.startsWith('www.') && host.length > 4 ? [host, host.slice(4)] : [host]
}

export const MAX_DOMAINS_PER_STORE = 5

/** What the owner typed in the "add a web address" box: tolerates https://, paths and capitals. */
export function parseDomainInput(raw: string): { ok: true; host: string } | { ok: false; error: string } {
  const typed = raw.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#]/)[0]
  const host = normalizeHost(typed)
  if (!host) return { ok: false, error: 'Type the web address, for example shop.example.pk.' }
  if (!isValidDomain(host)) return { ok: false, error: 'That is not a valid web address. Use letters, digits and dashes, ending like .pk or .com (no spaces, no IP numbers).' }
  return { ok: true, host }
}
