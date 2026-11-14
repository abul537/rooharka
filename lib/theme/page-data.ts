import { getCatalog } from '@/lib/data/catalog'
import { getHomeReviews } from '@/lib/storefront/reviews'
import { getPublicCollection, listPublicCollections } from '@/lib/admin/collections'
import type { Section } from '@/lib/theme/schema'
import type { SectionData } from '@/components/sections/registry'
import { relatedItems, type CatalogItem } from '@/lib/catalog'
import { loadProductPage } from '@/lib/data/product'

type StoreRef = { id: string; name: string; currency: string }

/** The products of a collection that customers can see, in the owner's order. */
export const collectionItems = (ids: { productId: string }[], catalog: CatalogItem[]): CatalogItem[] => {
  const byId = new Map(catalog.map((i) => [i.id, i]))
  return ids.map((p) => byId.get(p.productId)).filter((i): i is CatalogItem => !!i)
}

/**
 * For the dashboard's live preview of the product and collection pages: a real product and a real collection of
 * THIS store to show (the featured product, the first collection), and where the eye button should open them.
 * Without a product or collection yet, that part is simply absent and the preview says so.
 */
export async function loadSamples(store: StoreRef & { slug: string }): Promise<Pick<SectionData, 'product' | 'collection'> & { paths: { product: string | null; collection: string | null } }> {
  const [{ items }, collections] = await Promise.all([getCatalog(store.id), listPublicCollections(store.id)])
  const pickP = [...items].sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || a.createdAt - b.createdAt)[0]
  const [page, c] = await Promise.all([
    pickP ? loadProductPage({ id: store.id, name: store.name, slug: store.slug, currency: store.currency }, pickP.slug, false) : null,
    collections[0] ? getPublicCollection(store.id, collections[0].handle) : null,
  ])
  return {
    // The bar that follows the customer down the page would cover the editor, so the preview leaves it out.
    product: page ? { page: { ...page, settings: { ...page.settings, showStickyBuyBar: false } }, related: relatedItems(items, page.product.slug, 8) } : undefined,
    collection: c ? { title: c.title, description: c.description, items: collectionItems(c.products, items).slice(0, 24) } : undefined,
    paths: { product: page ? `/product/${page.product.slug}` : null, collection: c ? `/collections/${c.handle}` : null },
  }
}

/**
 * Gathers what the sections of ONE page need to draw themselves, each kind once, and only the kinds that page uses
 * (a page without a collections section never asks for collections). Everything is limited to the store given.
 * `forEditor`: the dashboard's live preview, which needs every collection but only a screenful of products.
 */
export async function loadSectionData(store: StoreRef, sections: Section[], forEditor = false): Promise<SectionData> {
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
