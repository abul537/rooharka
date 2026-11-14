import { getCatalog } from '@/lib/data/catalog'
import { getHomeReviews } from '@/lib/storefront/reviews'
import { getPublicCollection, listPublicCollections } from '@/lib/admin/collections'
import type { Section } from '@/lib/theme/schema'
import type { SectionData } from '@/components/sections/registry'

/**
 * Gathers what the sections of ONE page need to draw themselves, each kind once, and only the kinds that page uses
 * (a page without a collections section never asks for collections). Everything is limited to the store given.
 * `forEditor`: the dashboard's live preview, which needs every collection but only a screenful of products.
 */
export async function loadSectionData(store: { id: string; name: string; currency: string }, sections: Section[], forEditor = false): Promise<SectionData> {
  const visible = sections.filter((s) => !s.hidden)
  const uses = (type: string) => visible.some((s) => s.type === type)
  const all = forEditor || uses('collection-list') ? await listPublicCollections(store.id) : []
  // The editor's live preview may switch a grid to any collection, so it gets them all (the shop only what the page uses).
  const handles = forEditor ? all.slice(0, 40).map((c) => c.handle) : [...new Set(visible.filter((s) => s.type === 'product-grid' && s.settings.source === 'collection' && s.settings.collection).map((s) => String(s.settings.collection)))]
  const [{ items, categories }, reviews, collections, picked] = await Promise.all([
    getCatalog(store.id),
    getHomeReviews(store.id),
    all,
    Promise.all(handles.map(async (h) => [h, (await getPublicCollection(store.id, h))?.products.map((p) => p.productId) ?? []] as const)),
  ])
  return {
    store: { name: store.name, currency: store.currency },
    products: [...items].sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || b.createdAt - a.createdAt).slice(0, forEditor ? 60 : undefined),
    categories, collections, collectionProducts: Object.fromEntries(picked), reviews,
  }
}
