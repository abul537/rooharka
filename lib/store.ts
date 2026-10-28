import { cache } from 'react'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { memoKeyed } from '@/lib/memo'
import { hostCandidates, isValidDomain, normalizeHost } from '@/lib/domains'

/**
 * Which store (tenant) is this request for?
 *
 * 1. The web address the visitor typed (the Host header) is looked up in the StoreDomain table. Only addresses
 *    the platform owner has switched live (verifiedAt set) route; "www." is optional.
 * 2. Anything else (localhost, a preview link, an unknown address) falls back to DEFAULT_STORE_SLUG
 *    (default "mppmhk"), so development and the first store keep working with no setup.
 * A live address whose store is suspended shows NO shop (it does not fall back to another store).
 * Wrapped in React `cache` so it hits the database once per request.
 */
const loadStore = memoKeyed(30_000, async (slug: string) => {
  const store = await db.store.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, status: true, settings: { select: { currency: true, displayName: true } } },
  })
  if (!store || store.status === 'SUSPENDED' || store.status === 'CANCELLED') return null
  return {
    id: store.id,
    name: store.settings?.displayName ?? store.name,
    slug: store.slug,
    currency: store.settings?.currency ?? 'PKR',
  }
})

// The store record changes rarely, so it is remembered for 30 seconds instead of being fetched on every
// page view (each database trip is slow over a long distance). Renaming the store or suspending it takes
// effect within 30 seconds. `cache` additionally dedupes calls within one request.
const slugForHost = memoKeyed(30_000, async (host: string) => {
  const row = await db.storeDomain.findUnique({ where: { host }, select: { verifiedAt: true, store: { select: { slug: true } } } })
  return row?.verifiedAt ? row.store.slug : null
}, 2000)

export const getCurrentStore = cache(async () => {
  const host = normalizeHost((await headers()).get('host'))
  if (host && isValidDomain(host)) {
    for (const candidate of hostCandidates(host)) {
      const slug = await slugForHost(candidate)
      if (slug) return loadStore(slug)
    }
  }
  return loadStore(process.env.DEFAULT_STORE_SLUG ?? 'mppmhk')
})

/** Store name for the dashboard header: remembered for 30 seconds. */
export const getStoreName = memoKeyed(30_000, async (storeId: string) =>
  (await db.store.findUnique({ where: { id: storeId }, select: { name: true } }))?.name ?? 'Store')
