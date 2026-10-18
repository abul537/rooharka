import { cache } from 'react'
import { db } from '@/lib/db'
import { memoKeyed } from '@/lib/memo'

/**
 * Which store (tenant) is this request for?
 *
 * For now the store is chosen with the DEFAULT_STORE_SLUG environment variable
 * (falls back to "mppmhk"). When stores get their own domains, this is the ONE
 * place to change: look the request's Host up in the StoreDomain table instead.
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
export const getCurrentStore = cache(() => loadStore(process.env.DEFAULT_STORE_SLUG ?? 'mppmhk'))

/** Store name for the dashboard header: remembered for 30 seconds. */
export const getStoreName = memoKeyed(30_000, async (storeId: string) =>
  (await db.store.findUnique({ where: { id: storeId }, select: { name: true } }))?.name ?? 'Store')
