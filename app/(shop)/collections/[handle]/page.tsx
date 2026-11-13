import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCurrentStore } from '@/lib/store'
import { getCatalog } from '@/lib/data/catalog'
import { getPublicCollection } from '@/lib/admin/collections'
import ProductCard from '@/components/shop/ProductCard'

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
  const c = await getPublicCollection(store.id, handle) // limited to THIS store and to visible collections
  if (!c) notFound()
  // The catalogue only holds this store's ACTIVE products, so drafts and archived products drop out here.
  const byId = new Map((await getCatalog(store.id)).items.map((i) => [i.id, i]))
  const items = c.products.map((p) => byId.get(p.productId)).filter((i): i is NonNullable<typeof i> => !!i)
  return (
    <div className="bg-gradient-to-b from-brand-50 to-white pb-20">
      <section className="border-b border-brand-100 py-12 text-center">
        <div className="container mx-auto px-4">
          <nav aria-label="Breadcrumb" className="mb-3 text-sm text-gray-500"><Link href="/" className="hover:text-brand-700">Home</Link><span aria-hidden> / </span><Link href="/shop" className="hover:text-brand-700">Shop</Link></nav>
          <h1 className="font-playfair text-4xl font-bold text-gray-900 md:text-5xl">{c.title}</h1>
          {c.description && <p className="mx-auto mt-3 max-w-xl text-gray-600">{c.description}</p>}
        </div>
      </section>
      <div className="container mx-auto px-4 pt-8">
        {items.length === 0
          ? <p className="py-16 text-center text-gray-600">Nothing here yet. <Link href="/shop" className="underline text-brand-700">Browse the whole shop</Link>.</p>
          : <ul className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">{items.map((item) => <li key={item.id} className="flex"><div className="flex w-full"><ProductCard item={item} currency={store.currency} /></div></li>)}</ul>}
      </div>
    </div>
  )
}
