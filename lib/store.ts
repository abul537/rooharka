import { cache } from 'react'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { memoKeyed } from '@/lib/memo'
import { hostCandidates, isValidDomain, normalizeHost } from '@/lib/domains'
import { subdomainOf } from '@/lib/platform-host'
import { getPreview, isPreviewFor } from '@/lib/preview/server'
import { previewAllowedAt } from '@/lib/preview/rules'

/**
 * Which store (tenant) is this request for?
 *
 * 1. The web address the visitor typed (the Host header) is looked up in the StoreDomain table. Only addresses
 *    the platform owner has switched live (verifiedAt set) route; "www." is optional.
 * 2. A store's free address, <store>.<PLATFORM_HOST>, picks that store directly (unknown or suspended: no shop).
 * 3. Anything else (localhost, a preview link, an unknown address) falls back to DEFAULT_STORE_SLUG
 *    (default "mppmhk"), so development and the first store keep working with no setup.
 * A live address whose store is suspended shows NO shop (it does not fall back to another store).
 * Wrapped in React `cache` so it hits the database once per request.
 */
const shape = (store: { id: string; name: string; slug: string; status: string; shopApproval: string; shopDecisionNote: string | null; settings: { currency: string; displayName: string | null } | null } | null) => {
  if (!store || store.status === 'SUSPENDED' || store.status === 'CANCELLED') return null
  return { id: store.id, name: store.settings?.displayName ?? store.name, slug: store.slug, currency: store.settings?.currency ?? 'PKR', approval: store.shopApproval, note: store.shopDecisionNote }
}
const STORE_SELECT = { id: true, name: true, slug: true, status: true, shopApproval: true, shopDecisionNote: true, settings: { select: { currency: true, displayName: true } } } as const
const loadStore = memoKeyed(30_000, async (slug: string) => shape(await db.store.findUnique({ where: { slug }, select: STORE_SELECT })))

// The store record changes rarely, so it is remembered for 30 seconds instead of being fetched on every
// page view (each database trip is slow over a long distance). Renaming the store or suspending it takes
// effect within 30 seconds. `cache` additionally dedupes calls within one request.
const slugForHost = memoKeyed(30_000, async (host: string) => {
  const row = await db.storeDomain.findUnique({ where: { host }, select: { verifiedAt: true, store: { select: { slug: true } } } })
  return row?.verifiedAt ? row.store.slug : null
}, 2000)

const loadStoreById = memoKeyed(30_000, async (id: string) => shape(await db.store.findUnique({ where: { id }, select: STORE_SELECT })))

/**
 * The store for this address, and whether the ADDRESS itself names it.
 *  - bound: the address belongs to one store (its own domain, or <store>.<platform address>). Nothing can change which store it shows.
 *  - not bound: the address names no store (localhost, a deployment's test address). It shows the default store,
 *    EXCEPT to a staff member holding a valid preview pass, who sees their own store there. This is what lets an
 *    owner preview on an address that is shared by every store (development, or before their domain is set up).
 */
const resolveHost = cache(async (): Promise<{ store: Awaited<ReturnType<typeof loadStore>>; bound: boolean }> => {
  const host = normalizeHost((await headers()).get('host'))
  if (host && isValidDomain(host)) {
    for (const candidate of hostCandidates(host)) {
      const slug = await slugForHost(candidate)
      if (slug) return { store: await loadStore(slug), bound: true }
    }
    // slug.<platform address>: every store gets one for free (needs the wildcard DNS record, see README).
    const sub = subdomainOf(host)
    if (sub) return { store: await loadStore(sub), bound: true }
  }
  const pass = await getPreview()
  const own = pass ? await loadStoreById(pass.storeId) : null
  return { store: own ?? (await loadStore(process.env.DEFAULT_STORE_SLUG ?? 'mppmhk')), bound: false }
})

/** Resolves the store for this address, whatever its approval state (used by the shop shell to explain a closed shop). */
const resolveStore = async () => (await resolveHost()).store

/**
 * For the preview route only: may a preview of `storeId` be opened at THIS address, and which store is it?
 * On a store's own address only that store may be previewed; on a shared address the (signed) token decides.
 */
export async function previewTarget(storeId: string) {
  const at = await resolveHost()
  if (!previewAllowedAt({ bound: at.bound, hostStoreId: at.store?.id ?? null, tokenStoreId: storeId })) return null
  return at.bound ? at.store : loadStoreById(storeId)
}

/**
 * The store customers may use right now. A shop the platform owner has not approved (or has put on hold) returns
 * null, exactly like an unknown address, so every page, API route and checkout is closed with one rule.
 */
export const getCurrentStore = cache(async () => {
  const store = await resolveStore()
  if (!store) return null
  // The owner previewing their own shop may see it before it is approved; nobody else can (see lib/preview).
  return store.approval === 'APPROVED' || (await isPreviewFor(store.id)) ? store : null
})

/** The store shown at this address whatever its approval state (the shop shell uses it to word the preview banner). */
export const getStoreForHost = resolveStore

/** For the shop shell only: why the shop is closed (waiting for approval, or not approved with the owner's reason). */
export const getShopClosure = cache(async () => {
  const store = await resolveStore()
  return store && store.approval !== 'APPROVED' && !(await isPreviewFor(store.id)) ? { name: store.name, approval: store.approval, note: store.note } : null
})

/** Store name for the dashboard header: remembered for 30 seconds. */
export const getStoreName = memoKeyed(30_000, async (storeId: string) =>
  (await db.store.findUnique({ where: { id: storeId }, select: { name: true } }))?.name ?? 'Store')
