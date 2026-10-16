import { cache } from 'react'
import { db } from '@/lib/db'

/**
 * Which store (tenant) is this request for?
 *
 * For now the store is chosen with the DEFAULT_STORE_SLUG environment variable
 * (falls back to "mppmhk"). When stores get their own domains, this is the ONE
 * place to change: look the request's Host up in the StoreDomain table instead.
 * Wrapped in React `cache` so it hits the database once per request.
 */
export const getCurrentStore = cache(async () => {
  const slug = process.env.DEFAULT_STORE_SLUG ?? 'mppmhk'
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
