import { cache } from 'react'
import { db } from '@/lib/db'
import { isPreviewFor } from '@/lib/preview/server'
import { visibleStatuses } from '@/lib/preview/rules'
import { memoKeyed } from '@/lib/memo'
import type { CatalogItem } from '@/lib/catalog'
import { perUnit } from '@/lib/units/registry'

export interface CatalogCategory { slug: string; name: string; count: number }

/**
 * Every live product of a store as light plain objects, remembered for 15 seconds. Search, filtering, sorting and
 * paging then happen in memory (instant, no database trip per click). New products and price changes show within
 * 15 seconds; the product page itself is always live.
 */
async function buildCatalog(storeId: string, preview: boolean) {
  const [products, ratings, cats] = await Promise.all([
    db.product.findMany({
      where: { storeId, status: { in: visibleStatuses(preview) }, variants: { some: { isActive: true } } },
      select: {
        id: true, slug: true, name: true, status: true, subtitle: true, shortDescription: true, isFeatured: true, createdAt: true, unitCode: true,
        category: { select: { slug: true, isActive: true } },
        media: { where: { media: { kind: 'IMAGE' } }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1, select: { media: { select: { url: true, alt: true } } } },
        variants: { where: { isActive: true }, select: { price: true, compareAtPrice: true, stock: true, trackStock: true, allowBackorder: true } },
      },
    }),
    db.review.groupBy({ by: ['productId'], where: { isApproved: true, product: { storeId } }, _avg: { rating: true }, _count: { _all: true } }),
    db.category.findMany({ where: { storeId, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { slug: true, name: true } }),
  ])
  const rating = new Map(ratings.map((r) => [r.productId, r]))

  const items: CatalogItem[] = products.map((p) => {
    const prices = p.variants.map((v) => v.price.toNumber())
    const cheapest = p.variants.reduce((a, b) => (b.price.toNumber() < a.price.toNumber() ? b : a))
    const r = rating.get(p.id)
    const img = p.media[0]?.media
    return {
      id: p.id, slug: p.slug, name: p.name, subtitle: p.subtitle, ...(p.status === 'DRAFT' ? { isDraft: true } : {}),
      categorySlug: p.category?.isActive ? p.category.slug : null,
      isFeatured: p.isFeatured, createdAt: p.createdAt.getTime(),
      imageUrl: img?.url ?? null, imageAlt: img?.alt ?? null,
      minPrice: Math.min(...prices), maxPrice: Math.max(...prices),
      compareAt: cheapest.compareAtPrice?.toNumber() ?? null,
      perUnit: perUnit(p.unitCode),
      soldOut: p.variants.every((v) => v.trackStock && !v.allowBackorder && v.stock <= 0),
      rating: r?._avg.rating ? Math.round(r._avg.rating * 10) / 10 : null, ratingCount: r?._count._all ?? 0,
      haystack: `${p.name} ${p.subtitle ?? ''} ${p.shortDescription ?? ''}`.toLowerCase(),
    }
  })
  const categories: CatalogCategory[] = cats
    .map((c) => ({ ...c, count: items.filter((i) => i.categorySlug === c.slug).length }))
    .filter((c) => c.count > 0)
  return { items, categories }
}

// The PUBLIC catalogue (live products only) is remembered for 15 seconds and shared by all visitors.
const loadCatalog = memoKeyed(15_000, (storeId: string) => buildCatalog(storeId, false))
// A PREVIEW catalogue (live + draft) is built fresh for the owner's own request and is never put in the shared memory,
// so a draft can never leak to a customer through a cache.
const loadPreviewCatalog = cache((storeId: string) => buildCatalog(storeId, true))

export async function getCatalog(storeId: string) {
  return (await isPreviewFor(storeId)) ? loadPreviewCatalog(storeId) : loadCatalog(storeId)
}
