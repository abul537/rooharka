import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCurrentStore } from '@/lib/store'
import { getCatalog } from '@/lib/data/catalog'
import { getPublicCollection } from '@/lib/admin/collections'
import { isPreviewFor } from '@/lib/preview/server'
import { getShopContext } from '@/lib/storefront/data'
import { collectionItems, loadSectionData } from '@/lib/theme/page-data'
import { RenderSections } from '@/components/sections/registry'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ handle: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ handle }, store] = await Promise.all([params, getCurrentStore()])
  const c = store ? await getPublicCollection(store.id, handle) : null
  return c ? { title: `${c.title} | ${store!.name}`, description: c.description ?? `${c.title} from ${store!.name}.` } : { title: 'Collection not found' }
}

/** A collection page: the owner's hand-picked products, in the owner's order. Only live products are shown. */
export default async function CollectionPage({ params }: Props) {
  const [{ handle }, store] = await Promise.all([params, getCurrentStore()])
  if (!store) notFound()
  const c = await getPublicCollection(store.id, handle, await isPreviewFor(store.id)) // limited to THIS store; hidden ones only in the owner's preview
  if (!c) notFound()
  // The page is DRAWN from the theme's "collection" template. The catalogue only holds this store's live products
  // (plus drafts in the owner's preview), so anything else in the collection drops out here.
  const { sections } = (await getShopContext(store)).pages.collection
  const [base, catalog] = await Promise.all([loadSectionData(store, sections), getCatalog(store.id)])
  const data = { ...base, collection: { title: c.title, description: c.description, items: collectionItems(c.products, catalog.items) } }
  return <div className="pb-20"><RenderSections sections={sections} data={data} ownHeading /></div>
}
