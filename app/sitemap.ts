import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { getStoreForHost } from '@/lib/store'
import { getShopContext } from '@/lib/storefront/data'
import { listPublicCollections } from '@/lib/admin/collections'
import { POLICY_KEYS } from '@/lib/storefront/rules'
import { shopSitemap } from '@/lib/seo'

export const dynamic = 'force-dynamic'

/**
 * /sitemap.xml: the list of pages search engines should know. On a shop's address it lists THAT shop's pages
 * (live products and collections only); on the platform's own address, the platform's public pages.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = ((await headers()).get('host') ?? '').toLowerCase()
  if (!host) return []
  const origin = `https://${host}`
  const store = await getStoreForHost().catch(() => null)
  if (!store || store.approval !== 'APPROVED') {
    // The platform's own site (or an address with no open shop: an empty list is the honest answer there).
    return store ? [] : ['/', '/pricing', '/signup', '/terms', '/privacy'].map((p) => ({ url: `${origin}${p}` }))
  }
  const [products, collections, ctx] = await Promise.all([
    db.product.findMany({ where: { storeId: store.id, status: 'ACTIVE' }, select: { slug: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 5000 }),
    listPublicCollections(store.id),
    getShopContext(store),
  ])
  return shopSitemap(origin, { products, collections: collections.map((c) => c.handle), policies: POLICY_KEYS.filter((k) => ctx.content.policies[k]) })
}
