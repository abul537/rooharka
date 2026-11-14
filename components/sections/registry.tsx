import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowRight, Check, Star } from 'lucide-react'
import type { CatalogItem } from '@/lib/catalog'
import type { HomeReviews } from '@/lib/storefront/reviews'
import { paragraphs, type Icon } from '@/lib/storefront/rules'
import type { Section } from '@/lib/theme/schema'
import { formatPrice } from '@/lib/format'
import ProductCard from '@/components/shop/ProductCard'
import TrustIcon from '@/components/shop/TrustIcon'
import MediaImage from '@/components/media/MediaImage'

/**
 * THE SECTION COMPONENTS. Each one draws a section of a page from its settings and blocks (lib/theme/schema.ts
 * describes what those are). They are plain server components: no client code, so pages stay fast.
 * Everything an owner typed is shown as text (React escapes it); links were checked when they were saved.
 */
export interface SectionData {
  store: { name: string; currency: string }
  /** The store's live products, featured first then newest. */
  products: CatalogItem[]
  categories: { slug: string; name: string; count: number }[]
  collections: { title: string; handle: string }[]
  /** Product ids of each collection a product grid asked for, in the owner's order. */
  collectionProducts: Record<string, string[]>
  reviews: HomeReviews
}
type Props = { section: Section; data: SectionData; /** True for the first section on the page (its image loads first). */ first: boolean }

const s = (section: Section, key: string) => String(section.settings[key] ?? '')
const on = (section: Section, key: string) => section.settings[key] === true
const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-brand-700 px-7 py-3.5 font-semibold text-white shadow-sm transition hover:bg-brand-800'
const btnGhost = 'inline-flex items-center justify-center rounded-xl border-2 border-brand-700 px-7 py-3.5 font-semibold text-brand-800 transition hover:bg-brand-50'
const heading = 'font-playfair text-3xl font-bold tracking-tight text-gray-900 md:text-4xl'

/** A link to a page of the shop (fast, in-app) or to another website (new tab). Nothing is drawn without both parts. */
function Go({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  if (!href) return null
  return href.startsWith('/') ? <Link href={href} className={className}>{children}</Link> : <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
}

function Hero({ section, data, first }: Props) {
  const spotlight = on(section, 'spotlight') ? data.products[0] ?? null : null
  const centered = s(section, 'layout') === 'centered'
  const image = s(section, 'imageUrl') || spotlight?.imageUrl || ''
  const r = data.reviews
  const H = first ? 'h1' : 'h2'
  const text = (
    <div className={centered ? 'mx-auto max-w-3xl text-center' : ''}>
      {s(section, 'badge') && <p className="mb-5 inline-block rounded-full bg-brand-100 px-4 py-1.5 text-sm font-medium text-brand-800">{s(section, 'badge')}</p>}
      <H className="text-4xl font-bold leading-tight tracking-tight text-gray-900 md:text-6xl">{s(section, 'title')}</H>
      {s(section, 'subtitle') && <p className="mt-4 text-xl font-light italic text-gray-700 md:text-2xl">{s(section, 'subtitle')}</p>}
      {s(section, 'text') && <p className={`mt-5 text-lg leading-relaxed text-gray-600 ${centered ? 'mx-auto max-w-2xl' : 'max-w-xl'}`}>{s(section, 'text')}</p>}
      <div className={`mt-8 flex flex-col gap-3 sm:flex-row ${centered ? 'sm:justify-center' : ''}`}>
        {s(section, 'primaryLabel') && <Go href={spotlight ? `/product/${spotlight.slug}` : s(section, 'primaryLink') || '/shop'} className={btnPrimary}>{s(section, 'primaryLabel')}<ArrowRight className="h-4 w-4" aria-hidden /></Go>}
        {s(section, 'secondaryLabel') && <Go href={s(section, 'secondaryLink')} className={btnGhost}>{s(section, 'secondaryLabel')}</Go>}
      </div>
      {on(section, 'showRating') && r.average !== null && r.count >= 3 && (
        <p className={`mt-6 flex items-center gap-2 text-sm text-gray-600 ${centered ? 'justify-center' : ''}`}><Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden /><span className="font-semibold text-gray-900">{r.average}</span> from {r.count} customer reviews</p>
      )}
    </div>
  )
  if (centered) return <section className="bg-gradient-to-b from-brand-50 to-white"><div className="container mx-auto px-4 py-16 md:py-24">{text}</div></section>
  const picture = (
    <div className="relative">
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-gradient-to-br from-brand-100 to-brand-50 shadow-xl ring-1 ring-gray-200 lg:aspect-[4/3.4]">
        {image
          ? <MediaImage src={image} width={1000} alt={spotlight ? spotlight.imageAlt ?? spotlight.name : ''} fill priority={first} sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
          : <div className="flex h-full items-center justify-center p-8 text-center text-2xl font-bold text-brand-700/70">{data.store.name}</div>}
      </div>
      {spotlight && (
        <Link href={`/product/${spotlight.slug}`} className="absolute -bottom-5 left-4 right-4 flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-lg ring-1 ring-gray-200 transition hover:shadow-xl sm:left-auto sm:right-6 sm:w-80">
          <span className="min-w-0"><span className="block truncate font-semibold text-gray-900">{spotlight.name}</span><span className="text-sm text-gray-600">{spotlight.maxPrice > spotlight.minPrice ? 'From ' : ''}{formatPrice(spotlight.minPrice, data.store.currency)}{spotlight.perUnit ? ` ${spotlight.perUnit}` : ''}</span></span>
          <span className="shrink-0 rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white">{spotlight.soldOut ? 'Sold out' : 'View'}</span>
        </Link>
      )}
    </div>
  )
  const left = s(section, 'layout') === 'image-left'
  return (
    <section className="bg-gradient-to-b from-brand-50 to-white">
      <div className="container mx-auto grid items-center gap-10 px-4 py-14 md:py-20 lg:grid-cols-2 lg:gap-16">
        <div className={left ? 'lg:order-2' : ''}>{text}</div>
        <div className={left ? 'lg:order-1' : ''}>{picture}</div>
      </div>
    </section>
  )
}

function Highlights({ section }: Props) {
  if (section.blocks.length === 0) return null
  return (
    <section aria-label="Why shop with us" className="border-y border-gray-100 bg-white">
      <ul className="container mx-auto grid gap-6 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
        {section.blocks.map((b) => (
          <li key={b.id} className="flex gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700"><TrustIcon name={String(b.settings.icon) as Icon} className="h-5 w-5" /></span>
            <span><span className="block font-semibold text-gray-900">{String(b.settings.title)}</span>{b.settings.text ? <span className="text-sm text-gray-600">{String(b.settings.text)}</span> : null}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ProductGrid({ section, data, first }: Props) {
  const source = s(section, 'source'), handle = s(section, 'collection')
  let list = data.products
  if (source === 'newest') list = [...list].sort((a, b) => b.createdAt - a.createdAt)
  else if (source === 'collection') {
    const byId = new Map(data.products.map((p) => [p.id, p]))
    list = (data.collectionProducts[handle] ?? []).map((id) => byId.get(id)).filter((p): p is CatalogItem => !!p)
  }
  if (on(section, 'skipFirst') && source !== 'collection') list = list.slice(1)
  list = list.slice(0, Number(s(section, 'count')) || 8)
  const all = source === 'collection' && handle ? `/collections/${handle}` : '/shop'
  // A grid that would be empty (no products yet, or an emptied collection) says so only when it is the page's main grid.
  if (list.length === 0 && (source === 'collection' || on(section, 'skipFirst'))) return null
  return (
    <section className="container mx-auto px-4 pt-20" aria-labelledby={`h-${section.id}`}>
      <div className="flex items-end justify-between gap-4">
        <h2 id={`h-${section.id}`} className={heading}>{s(section, 'title') || 'Our products'}</h2>
        {on(section, 'viewAll') && list.length > 0 && <Link href={all} className="shrink-0 font-semibold text-brand-700 hover:underline">View all<span aria-hidden> →</span></Link>}
      </div>
      {list.length === 0
        ? <p className="mt-8 rounded-2xl bg-gray-50 p-10 text-center text-gray-600">Products are coming soon. Please check back shortly.</p>
        : <ul className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">{list.map((item, i) => <li key={item.id} className="flex"><div className="flex w-full"><ProductCard item={item} currency={data.store.currency} priority={first && i < 4} /></div></li>)}</ul>}
    </section>
  )
}

function Tiles({ id, title, items }: { id: string; title: string; items: { href: string; name: string; note?: string }[] }) {
  if (items.length === 0) return null
  return (
    <section className="container mx-auto px-4 pt-20" aria-labelledby={`h-${id}`}>
      <h2 id={`h-${id}`} className={heading}>{title}</h2>
      <ul className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {items.map((t) => (
          <li key={t.href}><Link href={t.href} className="flex h-full flex-col justify-between rounded-2xl bg-brand-50 p-5 ring-1 ring-brand-100 transition hover:-translate-y-0.5 hover:bg-brand-100 hover:shadow-md"><span className="text-lg font-semibold text-gray-900">{t.name}</span><span className="mt-6 text-sm text-gray-600">{t.note ?? 'View'}<span aria-hidden> →</span></span></Link></li>
        ))}
      </ul>
    </section>
  )
}
const CategoryList = ({ section, data }: Props) => <Tiles id={section.id} title={s(section, 'title') || 'Shop by category'} items={data.categories.slice(0, 8).map((c) => ({ href: `/shop?category=${c.slug}`, name: c.name, note: `${c.count} product${c.count === 1 ? '' : 's'}` }))} />
const CollectionList = ({ section, data }: Props) => <Tiles id={section.id} title={s(section, 'title') || 'Our collections'} items={data.collections.slice(0, 8).map((c) => ({ href: `/collections/${c.handle}`, name: c.title }))} />

function ImageText({ section }: Props) {
  const paras = paragraphs(s(section, 'text')), image = s(section, 'imageUrl')
  if (paras.length === 0 && !image) return null
  const right = s(section, 'imageSide') === 'right'
  return (
    <section className="container mx-auto px-4 pt-24" aria-labelledby={`h-${section.id}`}>
      <div className={`grid items-center gap-10 ${image ? 'lg:grid-cols-2 lg:gap-16' : 'mx-auto max-w-3xl text-center'}`}>
        {image && <div className={`relative aspect-[4/3] overflow-hidden rounded-3xl bg-brand-100 shadow-lg ${right ? 'lg:order-2' : ''}`}><MediaImage src={image} width={900} alt="" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" /></div>}
        <div>
          <h2 id={`h-${section.id}`} className={heading}>{s(section, 'title')}</h2>
          <div className="mt-6 space-y-4 text-lg leading-relaxed text-gray-600">{paras.map((p, i) => <p key={i}>{p}</p>)}</div>
          {s(section, 'buttonLabel') && <Go href={s(section, 'buttonLink')} className="mt-6 inline-block font-semibold text-brand-700 hover:underline">{s(section, 'buttonLabel')}<span aria-hidden> →</span></Go>}
        </div>
      </div>
    </section>
  )
}

function RichText({ section }: Props) {
  const paras = paragraphs(s(section, 'text'))
  if (!s(section, 'title') && paras.length === 0) return null
  const center = s(section, 'align') !== 'left'
  return (
    <section className={`mx-auto max-w-3xl px-4 pt-24 ${center ? 'text-center' : ''}`}>
      {s(section, 'title') && <h2 className={heading}>{s(section, 'title')}</h2>}
      <div className="mt-6 space-y-4 text-lg leading-relaxed text-gray-600">{paras.map((p, i) => <p key={i}>{p}</p>)}</div>
      {s(section, 'buttonLabel') && <div className="mt-8"><Go href={s(section, 'buttonLink')} className={btnPrimary}>{s(section, 'buttonLabel')}</Go></div>}
    </section>
  )
}

function Benefits({ section }: Props) {
  if (section.blocks.length === 0) return null
  return (
    <section className="container mx-auto px-4 pt-24" aria-labelledby={`h-${section.id}`}>
      <div className="rounded-3xl bg-brand-50 px-6 py-12 ring-1 ring-brand-100 md:px-12">
        <h2 id={`h-${section.id}`} className={`${heading} text-center`}>{s(section, 'title')}</h2>
        <ul className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
          {section.blocks.map((b) => <li key={b.id} className="flex items-start gap-3 text-gray-800"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-700 text-white"><Check className="h-4 w-4" aria-hidden /></span>{String(b.settings.text)}</li>)}
        </ul>
      </div>
    </section>
  )
}

function Reviews({ section, data }: Props) {
  if (data.reviews.items.length === 0) return null // no approved reviews yet: the section simply does not show
  return (
    <section className="container mx-auto px-4 pt-24" aria-labelledby={`h-${section.id}`}>
      <h2 id={`h-${section.id}`} className={`${heading} text-center`}>{s(section, 'title') || 'What our customers say'}</h2>
      <ul className="mt-10 grid gap-6 md:grid-cols-3">
        {data.reviews.items.map((r) => (
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
  )
}

function Faq({ section }: Props) {
  if (section.blocks.length === 0) return null
  return (
    <section className="mx-auto max-w-3xl px-4 pt-24" aria-labelledby={`h-${section.id}`}>
      <h2 id={`h-${section.id}`} className={`${heading} text-center`}>{s(section, 'title') || 'Questions, answered'}</h2>
      <div className="mt-8 divide-y divide-gray-200 border-y border-gray-200">
        {section.blocks.map((b) => (
          <details key={b.id} className="group py-5"><summary className="flex cursor-pointer list-none justify-between gap-4 font-semibold text-gray-900">{String(b.settings.q)}<span className="text-xl leading-none text-gray-400 transition-transform group-open:rotate-45" aria-hidden>+</span></summary><p className="mt-3 leading-relaxed text-gray-600">{String(b.settings.a ?? '')}</p></details>
        ))}
      </div>
    </section>
  )
}

function Cta({ section }: Props) {
  return (
    <section className="container mx-auto px-4 pt-24">
      <div className="rounded-3xl bg-brand-800 px-6 py-14 text-center text-white">
        <h2 className="font-playfair text-3xl font-bold tracking-tight md:text-4xl">{s(section, 'title')}</h2>
        {s(section, 'text') && <p className="mx-auto mt-3 max-w-xl text-white/80">{s(section, 'text')}</p>}
        {s(section, 'label') && <Go href={s(section, 'link') || '/shop'} className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 font-semibold text-brand-800 transition hover:bg-brand-50">{s(section, 'label')}<ArrowRight className="h-4 w-4" aria-hidden /></Go>}
      </div>
    </section>
  )
}

/**
 * THE COMPONENT REGISTRY: section type -> the component that draws it. The names here must match the types in
 * lib/theme/schema.ts (a test checks that every described section has a component and the other way round).
 */
export const SECTION_COMPONENTS: Record<string, (p: Props) => ReactNode> = {
  hero: Hero, highlights: Highlights, 'product-grid': ProductGrid, 'category-list': CategoryList, 'collection-list': CollectionList,
  'image-text': ImageText, 'rich-text': RichText, benefits: Benefits, reviews: Reviews, faq: Faq, cta: Cta,
}

/** Draws a page from its template: each visible section, in order, through the registry. */
export function RenderSections({ sections, data }: { sections: Section[]; data: SectionData }) {
  const visible = sections.filter((x) => !x.hidden)
  return <>{visible.map((section, i) => { const C = SECTION_COMPONENTS[section.type]; return C ? <C key={section.id} section={section} data={data} first={i === 0} /> : null })}</>
}
