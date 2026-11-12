import Link from 'next/link'
import { ArrowRight, Check, Star } from 'lucide-react'
import { getCurrentStore } from '@/lib/store'
import { getShopContext } from '@/lib/storefront/data'
import { getCatalog } from '@/lib/data/catalog'
import { getHomeReviews } from '@/lib/storefront/reviews'
import { paragraphs } from '@/lib/storefront/rules'
import { formatPrice } from '@/lib/format'
import ProductCard from '@/components/shop/ProductCard'
import TrustIcon from '@/components/shop/TrustIcon'
import MediaImage from '@/components/media/MediaImage'

// Rebuilt at most once a minute; dashboard edits to the Storefront show within that time.
export const revalidate = 60

const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-brand-700 px-7 py-3.5 font-semibold text-white shadow-sm transition hover:bg-brand-800'
const btnGhost = 'inline-flex items-center justify-center rounded-xl border-2 border-brand-700 px-7 py-3.5 font-semibold text-brand-800 transition hover:bg-brand-50'
const sectionTitle = 'font-playfair text-3xl font-bold tracking-tight text-gray-900 md:text-4xl'

export default async function Home() {
  const store = await getCurrentStore()
  if (!store) return null
  const [ctx, { items, categories }, reviews] = await Promise.all([getShopContext(store), getCatalog(store.id), getHomeReviews(store.id)])
  const c = ctx.content
  const single = c.layout === 'SINGLE_PRODUCT'

  const featured = [...items].sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || b.createdAt - a.createdAt)
  const spotlight = featured[0] ?? null
  const grid = featured.slice(0, 8)
  const storyParas = paragraphs(c.story.text)
  const heroImage = c.hero.imageUrl || (single ? spotlight?.imageUrl : null) || null

  return (
    <>
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="container mx-auto grid items-center gap-10 px-4 py-14 md:py-20 lg:grid-cols-2 lg:gap-16">
          <div>
            {c.hero.badge && <p className="mb-5 inline-block rounded-full bg-brand-100 px-4 py-1.5 text-sm font-medium text-brand-800">{c.hero.badge}</p>}
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-gray-900 md:text-6xl">{c.hero.title}</h1>
            {c.hero.subtitle && <p className="mt-4 text-xl font-light italic text-gray-700 md:text-2xl">{c.hero.subtitle}</p>}
            {c.hero.text && <p className="mt-5 max-w-xl text-lg leading-relaxed text-gray-600">{c.hero.text}</p>}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={single && spotlight ? `/product/${spotlight.slug}` : '/shop'} className={btnPrimary}>{c.hero.primaryLabel}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
              {c.hero.secondaryLabel && c.hero.secondaryLink && (c.hero.secondaryLink.startsWith('/') ? <Link href={c.hero.secondaryLink} className={btnGhost}>{c.hero.secondaryLabel}</Link> : <a href={c.hero.secondaryLink} target="_blank" rel="noopener noreferrer" className={btnGhost}>{c.hero.secondaryLabel}</a>)}
            </div>
            {reviews.average !== null && reviews.count >= 3 && (
              <p className="mt-6 flex items-center gap-2 text-sm text-gray-600"><Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden /><span className="font-semibold text-gray-900">{reviews.average}</span> from {reviews.count} customer reviews</p>
            )}
          </div>
          <div className="relative">
            <div className="relative aspect-square overflow-hidden rounded-3xl bg-gradient-to-br from-brand-100 to-brand-50 shadow-xl ring-1 ring-gray-200 lg:aspect-[4/3.4]">
              {heroImage
                ? <MediaImage src={heroImage} width={1000} alt={single && spotlight ? spotlight.imageAlt ?? spotlight.name : ''} fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
                : <div className="flex h-full items-center justify-center p-8 text-center text-2xl font-bold text-brand-700/70">{store.name}</div>}
            </div>
            {single && spotlight && (
              <Link href={`/product/${spotlight.slug}`} className="absolute -bottom-5 left-4 right-4 flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-lg ring-1 ring-gray-200 transition hover:shadow-xl sm:left-auto sm:right-6 sm:w-80">
                <span className="min-w-0"><span className="block truncate font-semibold text-gray-900">{spotlight.name}</span><span className="text-sm text-gray-600">{spotlight.maxPrice > spotlight.minPrice ? 'From ' : ''}{formatPrice(spotlight.minPrice, store.currency)}{spotlight.perUnit ? ` ${spotlight.perUnit}` : ''}</span></span>
                <span className="shrink-0 rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white">{spotlight.soldOut ? 'Sold out' : 'View'}</span>
              </Link>
            )}
          </div>
        </div>
      </section>

      {c.trust.length > 0 && (
        <section aria-label="Why shop with us" className="border-y border-gray-100 bg-white">
          <ul className="container mx-auto grid gap-6 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
            {c.trust.map((t) => (
              <li key={t.title} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700"><TrustIcon name={t.icon} className="h-5 w-5" /></span>
                <span><span className="block font-semibold text-gray-900">{t.title}</span>{t.text && <span className="text-sm text-gray-600">{t.text}</span>}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.show.categories && !single && categories.length > 0 && (
        <section className="container mx-auto px-4 pt-20" aria-labelledby="cats">
          <h2 id="cats" className={sectionTitle}>Shop by category</h2>
          <ul className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {categories.slice(0, 8).map((cat) => (
              <li key={cat.slug}><Link href={`/shop?category=${cat.slug}`} className="flex h-full flex-col justify-between rounded-2xl bg-brand-50 p-5 ring-1 ring-brand-100 transition hover:-translate-y-0.5 hover:bg-brand-100 hover:shadow-md"><span className="text-lg font-semibold text-gray-900">{cat.name}</span><span className="mt-6 text-sm text-gray-600">{cat.count} product{cat.count === 1 ? '' : 's'}</span></Link></li>
            ))}
          </ul>
        </section>
      )}

      {c.show.featured && !single && (
        <section className="container mx-auto px-4 pt-20" aria-labelledby="featured">
          <div className="flex items-end justify-between gap-4">
            <h2 id="featured" className={sectionTitle}>{featured.some((i) => i.isFeatured) ? 'Featured products' : 'Our products'}</h2>
            {items.length > 0 && <Link href="/shop" className="shrink-0 font-semibold text-brand-700 hover:underline">View all<span aria-hidden> →</span></Link>}
          </div>
          {grid.length === 0 ? (
            <p className="mt-8 rounded-2xl bg-gray-50 p-10 text-center text-gray-600">Products are coming soon. Please check back shortly.</p>
          ) : (
            <ul className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
              {grid.map((item, i) => <li key={item.id} className="flex"><div className="flex w-full"><ProductCard item={item} currency={store.currency} priority={i < 4} /></div></li>)}
            </ul>
          )}
        </section>
      )}

      {single && c.show.featured && grid.length > 1 && (
        <section className="container mx-auto px-4 pt-24" aria-labelledby="more">
          <h2 id="more" className={sectionTitle}>Also available</h2>
          <ul className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
            {grid.slice(1, 5).map((item) => <li key={item.id} className="flex"><div className="flex w-full"><ProductCard item={item} currency={store.currency} /></div></li>)}
          </ul>
        </section>
      )}

      {c.show.story && (storyParas.length > 0 || c.story.imageUrl) && (
        <section className="container mx-auto px-4 pt-24" aria-labelledby="story">
          <div className={`grid items-center gap-10 ${c.story.imageUrl ? 'lg:grid-cols-2 lg:gap-16' : 'mx-auto max-w-3xl text-center'}`}>
            {c.story.imageUrl && <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-brand-100 shadow-lg"><MediaImage src={c.story.imageUrl} width={900} alt="" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" /></div>}
            <div>
              <h2 id="story" className={sectionTitle}>{c.story.title}</h2>
              <div className="mt-6 space-y-4 text-lg leading-relaxed text-gray-600">{storyParas.map((p, i) => <p key={i}>{p}</p>)}</div>
              <Link href="/about" className="mt-6 inline-block font-semibold text-brand-700 hover:underline">Read more about us<span aria-hidden> →</span></Link>
            </div>
          </div>
        </section>
      )}

      {c.show.benefits && c.benefits.items.length > 0 && (
        <section className="container mx-auto px-4 pt-24" aria-labelledby="benefits">
          <div className="rounded-3xl bg-brand-50 px-6 py-12 ring-1 ring-brand-100 md:px-12">
            <h2 id="benefits" className={`${sectionTitle} text-center`}>{c.benefits.title}</h2>
            <ul className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
              {c.benefits.items.map((b) => <li key={b} className="flex items-start gap-3 text-gray-800"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-700 text-white"><Check className="h-4 w-4" aria-hidden /></span>{b}</li>)}
            </ul>
          </div>
        </section>
      )}

      {c.show.reviews && reviews.items.length > 0 && (
        <section className="container mx-auto px-4 pt-24" aria-labelledby="reviews">
          <h2 id="reviews" className={`${sectionTitle} text-center`}>What our customers say</h2>
          <ul className="mt-10 grid gap-6 md:grid-cols-3">
            {reviews.items.map((r) => (
              <li key={r.id}>
                <figure className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="flex gap-0.5" role="img" aria-label={`${r.rating} out of 5 stars`}>{Array.from({ length: 5 }, (_, i) => <Star key={i} className={`h-4 w-4 ${i < r.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} aria-hidden />)}</div>
                  <blockquote className="mt-4 flex-1 leading-relaxed text-gray-700">“{r.body}”</blockquote>
                  <figcaption className="mt-5 text-sm"><span className="font-semibold text-gray-900">{r.authorName}</span>{r.city && <span className="text-gray-500"> · {r.city}</span>}{r.isVerified && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Verified buyer</span>}<span className="mt-0.5 block text-gray-500">on {r.product}</span></figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.show.faq && c.faq.length > 0 && (
        <section className="mx-auto max-w-3xl px-4 pt-24" aria-labelledby="faq">
          <h2 id="faq" className={`${sectionTitle} text-center`}>Questions, answered</h2>
          <div className="mt-8 divide-y divide-gray-200 border-y border-gray-200">
            {c.faq.map((f) => (
              <details key={f.q} className="group py-5"><summary className="flex cursor-pointer list-none justify-between gap-4 font-semibold text-gray-900">{f.q}<span className="text-xl leading-none text-gray-400 transition-transform group-open:rotate-45" aria-hidden>+</span></summary><p className="mt-3 leading-relaxed text-gray-600">{f.a}</p></details>
            ))}
          </div>
        </section>
      )}

      {c.show.cta && (
        <section className="container mx-auto px-4 pt-24">
          <div className="rounded-3xl bg-brand-800 px-6 py-14 text-center text-white">
            <h2 className="font-playfair text-3xl font-bold tracking-tight md:text-4xl">{c.cta.title}</h2>
            {c.cta.text && <p className="mx-auto mt-3 max-w-xl text-white/80">{c.cta.text}</p>}
            <Link href={single && spotlight ? `/product/${spotlight.slug}` : '/shop'} className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 font-semibold text-brand-800 transition hover:bg-brand-50">{c.cta.label}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
          </div>
        </section>
      )}
    </>
  )
}
