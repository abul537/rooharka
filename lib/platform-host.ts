import { normalizeHost } from '@/lib/domains'

/**
 * Which web addresses are the PLATFORM's own (the public site that sells store accounts), as opposed to a store's shop.
 * Set PLATFORM_HOST="rooharka.pk" (several allowed, comma separated). With it unset, no address is the platform's:
 * every address shows a shop, exactly as before, and the public site is reachable only in development.
 */
export function platformHosts(env: string | undefined = process.env.PLATFORM_HOST): string[] {
  return (env ?? '').split(',').map((h) => normalizeHost(h)).filter((h): h is string => !!h)
}

export function isPlatformHost(host: string | null, env: string | undefined = process.env.PLATFORM_HOST): boolean {
  if (!host) return false
  const list = platformHosts(env)
  return list.some((p) => host === p || host === `www.${p}`)
}

/** May the public sign-up site be shown on this address? Platform addresses, or anything in development when none is set. */
export function marketingAllowed(host: string | null, env: string | undefined = process.env.PLATFORM_HOST, dev = process.env.NODE_ENV !== 'production'): boolean {
  if (isPlatformHost(host, env)) return true
  return dev && platformHosts(env).length === 0
}

/** "ali-store.rooharka.pk" -> "ali-store" when the host is a one-label sub-address of a platform host; otherwise null. */
export function subdomainOf(host: string | null, env: string | undefined = process.env.PLATFORM_HOST): string | null {
  if (!host) return null
  for (const p of platformHosts(env)) {
    if (host.endsWith(`.${p}`)) {
      const label = host.slice(0, -(p.length + 1))
      if (label && !label.includes('.') && label !== 'www') return label
    }
  }
  return null
}

/** The https address of the public site, used in emails. Falls back to the request's own address in development. */
export function platformOrigin(requestHost: string | null, env: string | undefined = process.env.PLATFORM_HOST): string {
  const first = platformHosts(env)[0]
  if (first) return `https://${first}`
  const h = requestHost ?? 'localhost:3000'
  return `${/^(localhost|127\.)/.test(h) ? 'http' : 'https'}://${h}`
}

/** The free shop address every store gets (<store>.<platform address>), or null when no platform address is configured. */
export function storeAddress(slug: string, env: string | undefined = process.env.PLATFORM_HOST): string | null {
  const first = platformHosts(env)[0]
  return first ? `https://${slug}.${first}` : null
}
