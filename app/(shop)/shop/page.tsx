import type { Metadata } from 'next'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { getCurrentStore } from '@/lib/store'
import { getCatalog } from '@/lib/data/catalog'
import { applyCatalog, pageWindow, parseCatalogParams, shopHref, SORTS, SORT_LABEL } from '@/lib/catalog'
import ProductCard from '@/components/shop/ProductCard'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const store = await getCurrentStore()
  return { title: store ? `Shop | ${store.name}` : 'Shop', description: store ? `Browse everything from ${store.name}.` : undefined }
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, store] = await Promise.all([searchParams, getCurrentStore()])
  if (!store) {
    return <div className="container mx-auto px-4 py-32 text-center"><h1 className="font-playfair text-3xl font-bold text-gray-900">This store is not available right now.</h1></div>
  }
  const { items, categories } = await getCatalog(store.id)
  const params = parseCatalogParams(sp)
  const result = applyCatalog(items, params)
  const filtered = !!(params.q || params.category)

  const chip = (active: boolean) =>
    `whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition ${active ? 'border-amber-700 bg-amber-700 text-white' : 'border-amber-200 bg-white text-gray-700 hover:border-amber-500'}`

  return (
    <div className="bg-gradient-to-b from-amber-50 to-white pb-20">
      <section className="border-b border-amber-100 py-12 text-center">
        <div className="container mx-auto px-4">
          <h1 className="font-playfair text-4xl font-bold text-gray-900 md:text-5xl">Shop</h1>
          <p className="mx-auto mt-3 max-w-xl text-gray-600">Everything from {store.name}, delivered to your door. Cash on delivery available.</p>
        </div>
      </section>

      <div className="container mx-auto px-4 pt-8">
        <form action="/shop" method="get" role="search" className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {params.category && <input type="hidden" name="category" value={params.category} />}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden />
            <input name="q" defaultValue={params.q} placeholder="Search products" maxLength={60} aria-label="Search products"
              className="w-full rounded-xl border border-amber-200 bg-white py-3 pl-11 pr-4 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <span className="shrink-0">Sort by</span>
            <select name="sort" defaultValue={params.sort} className="rounded-xl border border-amber-200 bg-white px-3 py-3 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500">
              {SORTS.map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
            </select>
          </label>
          <button className="rounded-xl bg-gradient-to-r from-amber-600 to-amber-800 px-6 py-3 font-semibold text-white transition hover:shadow-lg">Apply</button>
        </form>

        {categories.length > 0 && (
          <nav aria-label="Categories" className="mt-5 flex gap-2 overflow-x-auto pb-1">
            <Link href={shopHref(params, { category: null, page: 1 })} className={chip(!params.category)}>All</Link>
            {categories.map((c) => (
              <Link key={c.slug} href={shopHref(params, { category: c.slug, page: 1 })} aria-current={params.category === c.slug ? 'page' : undefined} className={chip(params.category === c.slug)}>
                {c.name} <span className="opacity-70">({c.count})</span>
              </Link>
            ))}
          </nav>
        )}

        <p className="mt-6 text-sm text-gray-600" aria-live="polite">
          {result.total === 0 ? 'No products found' : `${result.total} product${result.total === 1 ? '' : 's'}`}
          {params.q && <> for “{params.q}”</>}
          {filtered && <> · <Link href="/shop" className="font-medium text-amber-700 underline">Clear filters</Link></>}
        </p>

        {result.items.length === 0 ? (
          <div className="mx-auto max-w-md py-20 text-center">
            <p className="text-5xl" aria-hidden>🔍</p>
            <h2 className="mt-4 font-playfair text-2xl font-bold text-gray-900">{items.length === 0 ? 'Products are coming soon' : 'Nothing matches your search'}</h2>
            <p className="mt-2 text-gray-600">{items.length === 0 ? 'This store has not published any products yet. Please check back soon.' : 'Try a different word, or clear the filters to see everything.'}</p>
            {items.length > 0 && <Link href="/shop" className="mt-6 inline-block rounded-xl bg-amber-700 px-6 py-3 font-semibold text-white">Show all products</Link>}
          </div>
        ) : (
          <ul className="mt-6 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
            {result.items.map((item, i) => <li key={item.id} className="flex"><div className="flex w-full"><ProductCard item={item} currency={store.currency} priority={i < 4} /></div></li>)}
          </ul>
        )}

        {result.pages > 1 && (
          <nav aria-label="Pages" className="mt-12 flex flex-wrap items-center justify-center gap-2">
            {result.page > 1 && <Link href={shopHref(params, { page: result.page - 1 })} rel="prev" className="rounded-lg border border-amber-200 bg-white px-4 py-2 text-sm font-medium hover:border-amber-500">Previous</Link>}
            {pageWindow(result.page, result.pages).map((n, i) => n === '…'
              ? <span key={`gap${i}`} className="px-1 text-gray-400">…</span>
              : <Link key={n} href={shopHref(params, { page: n })} aria-current={n === result.page ? 'page' : undefined}
                  className={`min-w-10 rounded-lg border px-3 py-2 text-center text-sm font-medium ${n === result.page ? 'border-amber-700 bg-amber-700 text-white' : 'border-amber-200 bg-white hover:border-amber-500'}`}>{n}</Link>)}
            {result.page < result.pages && <Link href={shopHref(params, { page: result.page + 1 })} rel="next" className="rounded-lg border border-amber-200 bg-white px-4 py-2 text-sm font-medium hover:border-amber-500">Next</Link>}
          </nav>
        )}
      </div>
    </div>
  )
}
