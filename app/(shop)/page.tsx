import Link from 'next/link'
import { getCurrentStore } from '@/lib/store'
import { getShopContext } from '@/lib/storefront/data'
import { loadSectionData } from '@/lib/theme/page-data'
import { RenderSections } from '@/components/sections/registry'

// Rebuilt at most once a minute; a published theme shows on the shop within that time.
export const revalidate = 60

/**
 * The home page is not written here: it is DRAWN from the store's theme. The theme's "home" template lists
 * sections; each is drawn by its component (components/sections/registry.tsx).
 */
export default async function Home() {
  const store = await getCurrentStore()
  if (!store) return null
  const { sections } = (await getShopContext(store)).pages.home
  if (!sections.some((s) => !s.hidden)) {
    // An owner who removed every section still has a shop: send customers to the products.
    return <section className="container mx-auto px-4 py-24 text-center"><h1 className="text-4xl font-bold text-gray-900">{store.name}</h1><Link href="/shop" className="mt-8 inline-flex rounded-xl bg-brand-700 px-7 py-3.5 font-semibold text-white hover:bg-brand-800">Shop now</Link></section>
  }
  return <RenderSections sections={sections} data={await loadSectionData(store, sections)} />
}
