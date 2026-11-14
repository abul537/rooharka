import Link from 'next/link'
import { getCurrentStore } from '@/lib/store'
import { getShopContext } from '@/lib/storefront/data'
import { getCatalog } from '@/lib/data/catalog'
import { getHomeReviews } from '@/lib/storefront/reviews'
import { getPublicCollection, listPublicCollections } from '@/lib/admin/collections'
import { RenderSections, type SectionData } from '@/components/sections/registry'

// Rebuilt at most once a minute; a published theme shows on the shop within that time.
export const revalidate = 60

/**
 * The home page is not written here any more: it is DRAWN from the store's theme. The theme's "home" template lists
 * sections; each is drawn by its component (components/sections/registry.tsx). This file only gathers the data the
 * sections on this particular page need, each kind once.
 */
export default async function Home() {
  const store = await getCurrentStore()
  if (!store) return null
  const ctx = await getShopContext(store)
  const visible = ctx.home.sections.filter((s) => !s.hidden)
  const uses = (type: string) => visible.some((s) => s.type === type)
  const handles = [...new Set(visible.filter((s) => s.type === 'product-grid' && s.settings.source === 'collection' && s.settings.collection).map((s) => String(s.settings.collection)))]

  const [{ items, categories }, reviews, collections, picked] = await Promise.all([
    getCatalog(store.id),
    getHomeReviews(store.id),
    uses('collection-list') ? listPublicCollections(store.id) : [],
    Promise.all(handles.map(async (h) => [h, (await getPublicCollection(store.id, h))?.products.map((p) => p.productId) ?? []] as const)),
  ])
  const data: SectionData = {
    store: { name: store.name, currency: store.currency },
    products: [...items].sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || b.createdAt - a.createdAt),
    categories, collections, collectionProducts: Object.fromEntries(picked), reviews,
  }
  if (visible.length === 0) {
    // An owner who removed every section still has a shop: send customers to the products.
    return <section className="container mx-auto px-4 py-24 text-center"><h1 className="text-4xl font-bold text-gray-900">{store.name}</h1><Link href="/shop" className="mt-8 inline-flex rounded-xl bg-brand-700 px-7 py-3.5 font-semibold text-white hover:bg-brand-800">Shop now</Link></section>
  }
  return <RenderSections sections={ctx.home.sections} data={data} />
}
