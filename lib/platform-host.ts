import { isValidDomain, normalizeHost } from '@/lib/domains'

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
  // While developing (`pnpm dev`), your own computer always shows the public site, even when .env already names the
  // real platform address. In production only the platform's own address shows it.
  return dev && (platformHosts(env).length === 0 || isLocalAddress(host))
}

/** The developer's own computer: localhost, 127.0.0.1 or a *.localhost name. Never true for a real web address. */
export const isLocalAddress = (host: string | null) => !!host && (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost'))

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

/**
 * The ending of every store's free address (<store>.<ending>), or null when free addresses cannot exist: no platform
 * address is set, or it is a *.vercel.app address (Vercel cannot give a vercel.app address sub-addresses of its own).
 */
export function freeAddressSuffix(env: string | undefined = process.env.PLATFORM_HOST): string | null {
  const first = platformHosts(env)[0]
  return first && !first.endsWith('.vercel.app') ? first : null
}

/** The free shop address every store gets (<store>.<platform address>), or null when there are no free addresses. */
export function storeAddress(slug: string, env: string | undefined = process.env.PLATFORM_HOST): string | null {
  const suffix = freeAddressSuffix(env)
  return suffix ? `https://${slug}.${suffix}` : null
}

/**
 * The shop's own address while the platform's address shows the public site: DEFAULT_STORE_HOST="mppmhk.vercel.app".
 * It shows the first store (DEFAULT_STORE_SLUG) to customers, and any store to its own staff during a preview.
 * Ignored if it is not a real web address, or if it is one of the platform's own addresses (that would be a loop).
 */
export function defaultShopHost(env: string | undefined = process.env.DEFAULT_STORE_HOST, platformEnv: string | undefined = process.env.PLATFORM_HOST): string | null {
  const h = normalizeHost(env)
  return h && isValidDomain(h) && !isPlatformHost(h, platformEnv) ? h : null
}

type ShopEnv = { platform?: string; shop?: string; defaultSlug?: string }
const liveEnv = (): ShopEnv => ({ platform: process.env.PLATFORM_HOST, shop: process.env.DEFAULT_STORE_HOST, defaultSlug: process.env.DEFAULT_STORE_SLUG })

/**
 * Where a store's shop opens, for every link the dashboard, the emails and the messages give out. In order:
 *  1. your own computer while developing (the shop is right there);
 *  2. the store's own live web address (its primary one first);
 *  3. its free address (<store>.<platform address>);
 *  4. the shared shop address (DEFAULT_STORE_HOST): the first store's shop, and any store's preview;
 *  5. with no platform address set, the address in use now shows the shop.
 * null = the store has no public address yet (never a link to the wrong shop or to the public site).
 * `requestHost` is the Host header as sent (port included), or null outside a request.
 */
export function shopOrigin(i: { slug: string; domains: { host: string; isPrimary: boolean }[]; requestHost: string | null; preview?: boolean }, env: ShopEnv = liveEnv()): string | null {
  const req = i.requestHost && /^[a-z0-9.-]+(:\d{1,5})?$/i.test(i.requestHost) ? i.requestHost.toLowerCase() : null
  if (req && isLocalAddress(normalizeHost(req))) return `http://${req}`
  const own = i.domains.find((d) => d.isPrimary) ?? i.domains[0]
  if (own) return `https://${own.host}`
  const free = storeAddress(i.slug, env.platform)
  if (free) return free
  const shared = defaultShopHost(env.shop, env.platform)
  if (shared && (i.preview || i.slug === (env.defaultSlug || 'mppmhk'))) return `https://${shared}`
  if (platformHosts(env.platform).length === 0 && req) return `https://${req}`
  return null
}
