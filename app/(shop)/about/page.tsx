import type { Metadata } from 'next'
import { getCurrentStore } from '@/lib/store'
import { getShopContext } from '@/lib/storefront/data'
import { loadSectionData } from '@/lib/theme/page-data'
import { RenderSections } from '@/components/sections/registry'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const store = await getCurrentStore()
  if (!store) return { title: 'About' }
  return { title: (await getShopContext(store)).content.about.title }
}

/** The About page has no code of its own: it is the theme's "about" template, drawn by the same sections as Home. */
export default async function AboutPage() {
  const store = await getCurrentStore()
  if (!store) return null
  const { sections } = (await getShopContext(store)).pages.about
  return <div className="pb-8"><RenderSections sections={sections} data={await loadSectionData(store, sections)} /></div>
}
