import type { Metadata } from 'next'
import Link from 'next/link'
import { getCurrentStore } from '@/lib/store'
import { getShopContext } from '@/lib/storefront/data'
import { getCatalog } from '@/lib/data/catalog'
import { paragraphs } from '@/lib/storefront/rules'
import TrustIcon from '@/components/shop/TrustIcon'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const store = await getCurrentStore()
  if (!store) return { title: 'About' }
  return { title: (await getShopContext(store)).content.about.title }
}

/** About page: the owner's own text, plus their highlights. Written in the dashboard under Storefront. */
export default async function AboutPage() {
  const store = await getCurrentStore()
  if (!store) return null
  const [ctx, { items }] = await Promise.all([getShopContext(store), getCatalog(store.id)])
  const { about, trust } = ctx.content
  const paras = paragraphs(about.body)
  return (
    <div className="pb-8">
      <section className="bg-gradient-to-b from-brand-50 to-white py-14 text-center md:py-20">
        <div className="container mx-auto px-4"><h1 className="text-4xl font-bold tracking-tight text-gray-900 md:text-5xl">{about.title}</h1></div>
      </section>
      <div className="container mx-auto max-w-3xl px-4 pt-6">
        {paras.length > 0
          ? <div className="space-y-5 text-lg leading-relaxed text-gray-700">{paras.map((p, i) => <p key={i}>{p}</p>)}</div>
          : <p className="rounded-2xl bg-gray-50 p-8 text-center text-gray-600">{store.name} is a Pakistani online store. Browse the shop or send us a message if you have a question.</p>}
      </div>
      {trust.length > 0 && (
        <ul className="container mx-auto mt-14 grid max-w-4xl gap-6 px-4 sm:grid-cols-2">
          {trust.map((t) => (
            <li key={t.title} className="flex gap-4 rounded-2xl border border-gray-200 p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700"><TrustIcon name={t.icon} className="h-5 w-5" /></span>
              <span><span className="block font-semibold text-gray-900">{t.title}</span>{t.text && <span className="text-sm text-gray-600">{t.text}</span>}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-14 flex flex-wrap justify-center gap-3 px-4">
        {items.length > 0 && <Link href="/shop" className="rounded-xl bg-brand-700 px-7 py-3.5 font-semibold text-white hover:bg-brand-800">Visit the shop</Link>}
        <Link href="/contact" className="rounded-xl border-2 border-brand-700 px-7 py-3.5 font-semibold text-brand-800 hover:bg-brand-50">Contact us</Link>
      </div>
    </div>
  )
}
