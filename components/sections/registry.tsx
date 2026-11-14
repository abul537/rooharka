import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { ArrowRight, Check, Star } from 'lucide-react'
import type { CatalogItem } from '@/lib/catalog'
import type { HomeReview, HomeReviews } from '@/lib/storefront/reviews'
import { paragraphs, type Icon } from '@/lib/storefront/rules'
import { GALLERY_FOLD, focalCss, ratioCss, type Block, type Section } from '@/lib/theme/schema'
import { imageVariant, videoPoster } from '@/lib/media/urls'
import { formatPrice } from '@/lib/format'
import ProductCard from '@/components/shop/ProductCard'
import TrustIcon from '@/components/shop/TrustIcon'
import MediaImage from '@/components/media/MediaImage'
import NewsletterForm from '@/components/sections/NewsletterForm'
import type { ProductPageData } from '@/lib/data/product'
import ProductGallery from '@/components/product/Gallery'
import PurchasePanel from '@/components/product/PurchasePanel'
import ProductTabs from '@/components/product/ProductTabs'
import ProductFaqList from '@/components/product/Faq'

/**
 * THE SECTION COMPONENTS: one per section type, each drawing every one of its layouts (variants) from the section's
 * settings and blocks (described in lib/theme/schema.ts).
 *
 * Rules every component here follows:
 *  - A picture's SHAPE comes from a preset ratio and its crop from the focal point; there are no pixel sizes.
 *  - Only the first section's first picture is loaded eagerly (it is what the visitor sees first); everything
 *    else loads when it is about to scroll into view.
 *  - Rows you swipe ("carousels") are plain CSS scroll-snap: no script, they work with touch, mouse and keyboard.
 *  - Videos never start by themselves, except the muted hero background on larger screens.
 *  - Everything an owner typed is shown as text (React escapes it); links were checked when they were saved.
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
  /** On a product page: the product being looked at, and others from its category. */
  product?: { page: ProductPageData; related: CatalogItem[] }
  /** On a collection page: the collection being looked at, with its live products in the owner's order. */
  collection?: { title: string; description: string | null; items: CatalogItem[] }
}
type Props = { section: Section; data: SectionData; /** True for the first section on the page: its picture loads first. */ first: boolean; /** True when this section's headline is the page's main heading (h1). Product and collection pages have their own. */ lead: boolean }

const s = (x: { settings: Section['settings'] }, key: string) => String(x.settings[key] ?? '')
const on = (section: Section, key: string) => section.settings[key] === true
const btn = 'inline-flex items-center justify-center gap-2 rounded-[var(--r-btn)] px-7 py-3.5 font-semibold transition'
const btnPrimary = `${btn} bg-brand-700 text-white shadow-sm hover:bg-brand-800`
const btnGhost = `${btn} border-2 border-brand-700 text-brand-800 hover:bg-brand-50`
const btnLight = `${btn} bg-white text-brand-800 hover:bg-brand-50`
const heading = 'font-playfair text-3xl font-bold tracking-tight text-gray-900 md:text-4xl'
const box = 'rounded-[var(--r-box)]'
/** A row to swipe: scroll-snap, no script. Focusable so the arrow keys scroll it. */
const row = 'flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 sm:gap-6 [scrollbar-width:thin]'

/** A link to a page of the shop (fast, in-app) or to another website (new tab). Nothing is drawn without an address. */
function Go({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  if (!href) return null
  return href.startsWith('/') ? <Link href={href} className={className}>{children}</Link> : <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
}

/** A picture in a preset shape, cropped around its focal point. */
function Frame({ src, ratio, focal, alt = '', priority = false, sizes = '(min-width: 1024px) 50vw, 100vw', width = 1000, className = '' }: { src: string; ratio: string; focal?: string; alt?: string; priority?: boolean; sizes?: string; width?: number; className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-brand-100 ${box} ${className}`} style={{ aspectRatio: ratioCss(ratio) }}>
      <MediaImage src={src} width={width} alt={alt} fill priority={priority} sizes={sizes} className="object-cover" style={{ objectPosition: focalCss(focal) }} />
    </div>
  )
}
const Title = ({ id, text, center = false }: { id: string; text: string; center?: boolean }) => (text ? <h2 id={`h-${id}`} className={`${heading} ${center ? 'text-center' : ''}`}>{text}</h2> : null)
const labelled = (section: Section) => (s(section, 'title') ? { 'aria-labelledby': `h-${section.id}` } : { 'aria-label': section.type })

// ============================================================================ 1. Hero
function HeroText({ section, data, lead, light, center }: Props & { light: boolean; center: boolean }) {
  const spotlight = on(section, 'spotlight') ? data.products[0] ?? null : null
  const r = data.reviews, H = lead ? 'h1' : 'h2'
  return (
    <div className={center ? 'mx-auto max-w-3xl text-center' : 'max-w-xl'}>
      {s(section, 'badge') && <p className={`mb-5 inline-block rounded-full px-4 py-1.5 text-sm font-medium ${light ? 'bg-white/20 text-white backdrop-blur' : 'bg-brand-100 text-brand-800'}`}>{s(section, 'badge')}</p>}
      <H className={`text-4xl font-bold leading-tight tracking-tight md:text-6xl ${light ? 'text-white' : 'text-gray-900'}`}>{s(section, 'title')}</H>
      {s(section, 'subtitle') && <p className={`mt-4 text-xl font-light italic md:text-2xl ${light ? 'text-white/90' : 'text-gray-700'}`}>{s(section, 'subtitle')}</p>}
      {s(section, 'text') && <p className={`mt-5 text-lg leading-relaxed ${light ? 'text-white/90' : 'text-gray-600'} ${center ? 'mx-auto max-w-2xl' : ''}`}>{s(section, 'text')}</p>}
      <div className={`mt-8 flex flex-col gap-3 sm:flex-row ${center ? 'sm:justify-center' : ''}`}>
        {s(section, 'primaryLabel') && <Go href={spotlight ? `/product/${spotlight.slug}` : s(section, 'primaryLink') || '/shop'} className={light ? btnLight : btnPrimary}>{s(section, 'primaryLabel')}<ArrowRight className="h-4 w-4" aria-hidden /></Go>}
        {s(section, 'secondaryLabel') && <Go href={s(section, 'secondaryLink')} className={light ? `${btn} border-2 border-white text-white hover:bg-white/10` : btnGhost}>{s(section, 'secondaryLabel')}</Go>}
      </div>
      {on(section, 'showRating') && r.average !== null && r.count >= 3 && (
        <p className={`mt-6 flex items-center gap-2 text-sm ${light ? 'text-white/90' : 'text-gray-600'} ${center ? 'justify-center' : ''}`}><Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden /><span className="font-semibold">{r.average}</span> from {r.count} customer reviews</p>
      )}
    </div>
  )
}
/** A wide picture (or slide) with words on top. Never shorter than its words need, whatever the shape. */
function Cover({ image, focal, ratio, priority, children, video }: { image: string; focal: string; ratio: string; priority: boolean; children: ReactNode; video?: string }) {
  return (
    <div className="relative flex min-h-[26rem] w-full items-center overflow-hidden bg-brand-800" style={{ aspectRatio: ratioCss(ratio) }}>
      {image && <MediaImage src={image} width={1600} alt="" fill priority={priority} sizes="100vw" className="object-cover" style={{ objectPosition: focalCss(focal) }} />}
      {video && (
        // The one video that may start by itself: silent, looping, and only on larger screens (phones never download it
        // and show the picture). Only its first details are fetched until it plays.
        <video className="absolute inset-0 hidden h-full w-full object-cover md:block" autoPlay muted loop playsInline preload="metadata" poster={image || undefined} aria-hidden tabIndex={-1}>
          <source src={video} media="(min-width: 768px)" type={video.toLowerCase().includes('.webm') ? 'video/webm' : 'video/mp4'} />
        </video>
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/40 to-black/10" aria-hidden />
      <div className="container relative mx-auto px-4 py-14">{children}</div>
    </div>
  )
}
function Hero(p: Props) {
  const { section, data, first, lead } = p
  const layout = s(section, 'layout')
  const spotlight = on(section, 'spotlight') ? data.products[0] ?? null : null
  const image = s(section, 'imageUrl') || spotlight?.imageUrl || ''
  if (layout === 'centered') return <section className="bg-gradient-to-b from-brand-50 to-white"><div className="container mx-auto px-4 py-16 md:py-24"><HeroText {...p} light={false} center /></div></section>
  if (layout === 'carousel' && section.blocks.length > 0) {
    return (
      <section aria-roledescription="carousel" aria-label="Highlights" className="relative">
        <ul className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:thin]" tabIndex={0}>
          {section.blocks.map((b, i) => {
            const H = lead && i === 0 ? 'h1' : 'h2'
            return (
              <li key={b.id} className="w-full shrink-0 snap-center" aria-roledescription="slide" aria-label={`${i + 1} of ${section.blocks.length}`}>
                <Cover image={s(b, 'imageUrl')} focal={s(b, 'imageFocal')} ratio={s(section, 'ratio')} priority={first && i === 0}>
                  <div className="max-w-xl">
                    <H className="text-4xl font-bold leading-tight tracking-tight text-white md:text-6xl">{s(b, 'title')}</H>
                    {s(b, 'text') && <p className="mt-5 text-lg leading-relaxed text-white/90">{s(b, 'text')}</p>}
                    {s(b, 'label') && <div className="mt-8"><Go href={s(b, 'link') || '/shop'} className={btnLight}>{s(b, 'label')}<ArrowRight className="h-4 w-4" aria-hidden /></Go></div>}
                  </div>
                </Cover>
              </li>
            )
          })}
        </ul>
        {section.blocks.length > 1 && <p className="pointer-events-none absolute bottom-3 right-4 rounded-full bg-black/50 px-3 py-1 text-xs text-white">Swipe for more →</p>}
      </section>
    )
  }
  if (layout === 'full-bleed' || layout === 'video' || layout === 'carousel') {
    return <section><Cover image={image} focal={s(section, 'imageFocal')} ratio={s(section, 'ratio')} priority={first} video={layout === 'video' ? s(section, 'videoUrl') : undefined}><HeroText {...p} light center={false} /></Cover></section>
  }
  const left = layout === 'image-left'
  return (
    <section className="bg-gradient-to-b from-brand-50 to-white">
      <div className="container mx-auto grid items-center gap-10 px-4 py-14 md:py-20 lg:grid-cols-2 lg:gap-16">
        <div className={left ? 'lg:order-2' : ''}><HeroText {...p} light={false} center={false} /></div>
        <div className={`relative ${left ? 'lg:order-1' : ''}`}>
          <div className={`relative aspect-square overflow-hidden bg-gradient-to-br from-brand-100 to-brand-50 shadow-xl ring-1 ring-gray-200 lg:aspect-[4/3.4] ${box}`}>
            {image
              ? <MediaImage src={image} width={1000} alt={spotlight ? spotlight.imageAlt ?? spotlight.name : ''} fill priority={first} sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" style={{ objectPosition: focalCss(s(section, 'imageFocal')) }} />
              : <div className="flex h-full items-center justify-center p-8 text-center text-2xl font-bold text-brand-700/70">{data.store.name}</div>}
          </div>
          {spotlight && (
            <Link href={`/product/${spotlight.slug}`} className="absolute -bottom-5 left-4 right-4 flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-lg ring-1 ring-gray-200 transition hover:shadow-xl sm:left-auto sm:right-6 sm:w-80">
              <span className="min-w-0"><span className="block truncate font-semibold text-gray-900">{spotlight.name}</span><span className="text-sm text-gray-600">{spotlight.maxPrice > spotlight.minPrice ? 'From ' : ''}{formatPrice(spotlight.minPrice, data.store.currency)}{spotlight.perUnit ? ` ${spotlight.perUnit}` : ''}</span></span>
              <span className="shrink-0 rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white">{spotlight.soldOut ? 'Sold out' : 'View'}</span>
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}

// ============================================================================ 2. Featured products
function ProductGrid({ section, data, first }: Props) {
  const source = s(section, 'source'), handle = s(section, 'collection'), layout = s(section, 'layout')
  let list = data.products
  if (source === 'newest') list = [...list].sort((a, b) => b.createdAt - a.createdAt)
  else if (source === 'collection') {
    const byId = new Map(data.products.map((p) => [p.id, p]))
    list = (data.collectionProducts[handle] ?? []).map((id) => byId.get(id)).filter((p): p is CatalogItem => !!p)
  }
  if (on(section, 'skipFirst') && source !== 'collection') list = list.slice(1)
  list = list.slice(0, Number(s(section, 'count')) || 8)
  const all = source === 'collection' && handle ? `/collections/${handle}` : '/shop'
  // A grid that would be empty (an emptied collection, or nothing besides the featured product) is simply not drawn.
  if (list.length === 0 && (source === 'collection' || on(section, 'skipFirst'))) return null
  const card = (item: CatalogItem, i: number) => <div className="flex w-full"><ProductCard item={item} currency={data.store.currency} priority={first && i < 4} /></div>
  return (
    <section className="container mx-auto px-4 pt-20" aria-labelledby={`h-${section.id}`}>
      <div className="flex items-end justify-between gap-4">
        <h2 id={`h-${section.id}`} className={heading}>{s(section, 'title') || 'Our products'}</h2>
        {on(section, 'viewAll') && list.length > 0 && <Link href={all} className="shrink-0 font-semibold text-brand-700 hover:underline">View all<span aria-hidden> →</span></Link>}
      </div>
      {list.length === 0 ? <p className={`mt-8 bg-gray-50 p-10 text-center text-gray-600 ${box}`}>Products are coming soon. Please check back shortly.</p>
        : layout === 'carousel' ? <ul className={`mt-8 ${row}`} tabIndex={0}>{list.map((item, i) => <li key={item.id} className="flex w-[70%] shrink-0 snap-start sm:w-[42%] lg:w-[23.5%]">{card(item, i)}</li>)}</ul>
        : <ul className={`mt-8 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 ${layout === 'grid-3' ? '' : 'lg:grid-cols-4'}`}>{list.map((item, i) => <li key={item.id} className="flex">{card(item, i)}</li>)}</ul>}
    </section>
  )
}

// ============================================================================ 3. Category grid (and the classic Collections tiles)
const COLS: Record<string, string> = { '2': 'grid-cols-1 sm:grid-cols-2', '3': 'grid-cols-2 md:grid-cols-3', '4': 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4' }
function Tiles({ id, title, columns, items }: { id: string; title: string; columns: string; items: { href: string; name: string; note?: string }[] }) {
  if (items.length === 0) return null
  return (
    <section className="container mx-auto px-4 pt-20" aria-labelledby={`h-${id}`}>
      <h2 id={`h-${id}`} className={heading}>{title}</h2>
      <ul className={`mt-8 grid gap-4 ${COLS[columns] ?? COLS['4']}`}>
        {items.map((t) => (
          <li key={t.href}><Link href={t.href} className={`flex h-full flex-col justify-between bg-brand-50 p-5 ring-1 ring-brand-100 transition hover:-translate-y-0.5 hover:bg-brand-100 hover:shadow-md ${columns === '2' ? 'min-h-36' : ''} ${box}`}><span className="text-lg font-semibold text-gray-900">{t.name}</span><span className="mt-6 text-sm text-gray-600">{t.note ?? 'View'}<span aria-hidden> →</span></span></Link></li>
        ))}
      </ul>
    </section>
  )
}
const CategoryList = ({ section, data }: Props) => <Tiles id={section.id} title={s(section, 'title') || 'Shop by category'} columns={s(section, 'columns')} items={data.categories.slice(0, 8).map((c) => ({ href: `/shop?category=${c.slug}`, name: c.name, note: `${c.count} product${c.count === 1 ? '' : 's'}` }))} />
const CollectionList = ({ section, data }: Props) => <Tiles id={section.id} title={s(section, 'title') || 'Our collections'} columns="4" items={data.collections.slice(0, 8).map((c) => ({ href: `/collections/${c.handle}`, name: c.title }))} />

// ============================================================================ 4. Gallery
function Gallery({ section, first }: Props) {
  const pics = section.blocks.filter((b) => s(b, 'imageUrl'))
  if (pics.length === 0) return null
  const layout = s(section, 'layout'), ratio = s(section, 'ratio')
  const grid = layout === 'grid-2' ? 'grid-cols-1 sm:grid-cols-2' : layout === 'grid-4' ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3'
  const tile = (b: Block, i: number) => <Frame src={s(b, 'imageUrl')} ratio={ratio} focal={s(b, 'imageFocal')} alt={s(b, 'alt')} priority={first && i === 0} sizes="(min-width: 768px) 33vw, 50vw" width={800} />
  // Masonry: each picture keeps its own shape, so a plain <img> (its size is not known in advance); always lazy.
  // eslint-disable-next-line @next/next/no-img-element
  const brick = (b: Block) => <img src={imageVariant(s(b, 'imageUrl'), 800)} alt={s(b, 'alt')} loading="lazy" decoding="async" className={`mb-4 w-full ${box}`} />
  const shown = pics.slice(0, GALLERY_FOLD), rest = pics.slice(GALLERY_FOLD)
  const wall = (list: Block[], offset: number) => layout === 'masonry'
    ? <div className="columns-2 gap-4 md:columns-3">{list.map((b) => <div key={b.id} className="break-inside-avoid">{brick(b)}</div>)}</div>
    : <ul className={`grid gap-4 ${grid}`}>{list.map((b, i) => <li key={b.id}>{tile(b, i + offset)}</li>)}</ul>
  return (
    <section className="container mx-auto px-4 pt-20" {...labelled(section)}>
      <Title id={section.id} text={s(section, 'title')} />
      <div className={s(section, 'title') ? 'mt-8' : ''}>
        {layout === 'carousel'
          ? <ul className={row} tabIndex={0}>{pics.map((b, i) => <li key={b.id} className="w-[78%] shrink-0 snap-start sm:w-[45%] lg:w-[31%]">{tile(b, i)}</li>)}</ul>
          : <>
              {wall(shown, 0)}
              {/* More than 8: the rest is fetched only when the customer asks for it, so the page stays light. */}
              {rest.length > 0 && <details className="mt-4"><summary className={`mx-auto w-fit cursor-pointer list-none border-2 border-brand-700 px-6 py-2.5 font-semibold text-brand-800 hover:bg-brand-50 rounded-[var(--r-btn)]`}>Show all {pics.length} photos</summary><div className="mt-4">{wall(rest, GALLERY_FOLD)}</div></details>}
            </>}
      </div>
    </section>
  )
}

// ============================================================================ 5. Story / text
function Story({ section }: Props) {
  const layout = s(section, 'layout'), paras = paragraphs(s(section, 'text')), image = s(section, 'imageUrl'), title = s(section, 'title')
  const link = s(section, 'buttonLabel') ? <Go href={s(section, 'buttonLink')} className="mt-6 inline-block font-semibold text-brand-700 hover:underline">{s(section, 'buttonLabel')}<span aria-hidden> →</span></Go> : null
  const body = <div className="mt-6 space-y-4 text-lg leading-relaxed text-gray-600">{paras.map((p, i) => <p key={i}>{p}</p>)}</div>
  if (layout === 'timeline') {
    if (section.blocks.length === 0 && !title) return null
    return (
      <section className="mx-auto max-w-3xl px-4 pt-24" {...labelled(section)}>
        <Title id={section.id} text={title} center />
        {paras.length > 0 && <div className="text-center">{body}</div>}
        <ol className="mt-10 space-y-10 border-l-2 border-brand-200 pl-6">
          {section.blocks.map((b, i) => (
            <li key={b.id} className="relative">
              <span className="absolute -left-[2.15rem] flex h-7 w-7 items-center justify-center rounded-full bg-brand-700 text-sm font-semibold text-white" aria-hidden>{i + 1}</span>
              <h3 className="text-xl font-semibold text-gray-900">{s(b, 'title')}</h3>
              {paragraphs(s(b, 'text')).map((p, k) => <p key={k} className="mt-2 leading-relaxed text-gray-600">{p}</p>)}
              {s(b, 'imageUrl') && <Frame src={s(b, 'imageUrl')} ratio="16:9" focal={s(b, 'imageFocal')} className="mt-4" sizes="(min-width: 768px) 700px, 100vw" width={900} />}
            </li>
          ))}
        </ol>
        {link && <div className="text-center">{link}</div>}
      </section>
    )
  }
  if (!title && paras.length === 0 && !image) return null
  if (layout === 'overlay' && image) {
    return (
      <section className="container mx-auto px-4 pt-24" {...labelled(section)}>
        <div className={`relative flex min-h-[22rem] items-end overflow-hidden ${box}`} style={{ aspectRatio: ratioCss(s(section, 'ratio') === '4:5' ? '16:9' : s(section, 'ratio')) }}>
          <MediaImage src={image} width={1400} alt="" fill sizes="100vw" className="object-cover" style={{ objectPosition: focalCss(s(section, 'imageFocal')) }} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent" aria-hidden />
          <div className="relative max-w-2xl p-6 md:p-10">
            {title && <h2 id={`h-${section.id}`} className="font-playfair text-3xl font-bold tracking-tight text-white md:text-4xl">{title}</h2>}
            <div className="mt-4 space-y-3 text-lg leading-relaxed text-white/90">{paras.map((p, i) => <p key={i}>{p}</p>)}</div>
            {s(section, 'buttonLabel') && <Go href={s(section, 'buttonLink')} className="mt-5 inline-block font-semibold text-white underline">{s(section, 'buttonLabel')}<span aria-hidden> →</span></Go>}
          </div>
        </div>
      </section>
    )
  }
  const split = layout === 'split' && !!image
  const right = s(section, 'imageSide') === 'right'
  return (
    <section className="container mx-auto px-4 pt-24" {...labelled(section)}>
      <div className={`grid items-center gap-10 ${split ? 'lg:grid-cols-2 lg:gap-16' : 'mx-auto max-w-3xl text-center'}`}>
        {split && <Frame src={image} ratio={s(section, 'ratio')} focal={s(section, 'imageFocal')} className={`shadow-lg ${right ? 'lg:order-2' : ''}`} width={900} />}
        <div><Title id={section.id} text={title} />{body}{link}</div>
      </div>
    </section>
  )
}

// ============================================================================ 6. Video showcase
function Video({ section }: Props) {
  const clips = section.blocks.filter((b) => s(b, 'videoUrl'))
  if (clips.length === 0) return null
  const layout = s(section, 'layout')
  const clip = (b: Block) => (
    <figure>
      <div className={`overflow-hidden bg-black ${box}`} style={{ aspectRatio: ratioCss(s(section, 'ratio')) }}>
        {/* Never starts by itself and downloads nothing until the customer presses play. */}
        <video controls playsInline preload="none" poster={s(b, 'posterUrl') || videoPoster(s(b, 'videoUrl'), 1000) || undefined} className="h-full w-full object-cover" aria-label={s(b, 'caption') || 'Video'}>
          <source src={s(b, 'videoUrl')} type={s(b, 'videoUrl').toLowerCase().includes('.webm') ? 'video/webm' : 'video/mp4'} />
        </video>
      </div>
      {s(b, 'caption') && <figcaption className="mt-2 text-sm text-gray-600">{s(b, 'caption')}</figcaption>}
    </figure>
  )
  return (
    <section className="container mx-auto px-4 pt-20" {...labelled(section)}>
      <Title id={section.id} text={s(section, 'title')} center={layout === 'single'} />
      <div className={s(section, 'title') ? 'mt-8' : ''}>
        {layout === 'carousel' ? <ul className={row} tabIndex={0}>{clips.map((b) => <li key={b.id} className="w-[85%] shrink-0 snap-start md:w-[60%]">{clip(b)}</li>)}</ul>
          : layout === 'grid' ? <ul className="grid gap-6 md:grid-cols-2">{clips.map((b) => <li key={b.id}>{clip(b)}</li>)}</ul>
          : <div className="mx-auto max-w-4xl space-y-6">{clips.map((b) => <div key={b.id}>{clip(b)}</div>)}</div>}
      </div>
    </section>
  )
}

// ============================================================================ 7. Testimonials (real, approved reviews only)
const Stars = ({ n }: { n: number }) => <div className="flex gap-0.5" role="img" aria-label={`${n} out of 5 stars`}>{Array.from({ length: 5 }, (_, i) => <Star key={i} className={`h-4 w-4 ${i < n ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} aria-hidden />)}</div>
const By = ({ r }: { r: HomeReview }) => <figcaption className="mt-5 text-sm"><span className="font-semibold text-gray-900">{r.authorName}</span>{r.city && <span className="text-gray-500"> · {r.city}</span>}{r.isVerified && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Verified buyer</span>}<span className="mt-0.5 block text-gray-500">on {r.product}</span></figcaption>
function Reviews({ section, data }: Props) {
  const items = data.reviews.items
  if (items.length === 0) return null // no approved reviews yet: the section simply does not show
  const layout = s(section, 'layout')
  const card = (r: HomeReview) => <figure className={`flex h-full flex-col border border-gray-200 bg-white p-6 shadow-sm ${box}`}><Stars n={r.rating} /><blockquote className="mt-4 flex-1 leading-relaxed text-gray-700">“{r.body}”</blockquote><By r={r} /></figure>
  return (
    <section className="container mx-auto px-4 pt-24" aria-labelledby={`h-${section.id}`}>
      <h2 id={`h-${section.id}`} className={`${heading} text-center`}>{s(section, 'title') || 'What our customers say'}</h2>
      {layout === 'single'
        ? <figure className="mx-auto mt-10 max-w-3xl text-center"><div className="flex justify-center"><Stars n={items[0].rating} /></div><blockquote className="mt-5 font-playfair text-2xl leading-relaxed text-gray-800 md:text-3xl">“{items[0].body}”</blockquote><By r={items[0]} /></figure>
        : layout === 'carousel' ? <ul className={`mt-10 ${row}`} tabIndex={0}>{items.map((r) => <li key={r.id} className="w-[85%] shrink-0 snap-start sm:w-[48%] lg:w-[32%]">{card(r)}</li>)}</ul>
        : <ul className="mt-10 grid gap-6 md:grid-cols-3">{items.map((r) => <li key={r.id}>{card(r)}</li>)}</ul>}
    </section>
  )
}

// ============================================================================ 8. Banner / promo
function Banner({ section }: Props) {
  const action = s(section, 'label') ? <Go href={s(section, 'link') || '/shop'} className={`${btnLight} !py-2.5`}>{s(section, 'label')}<ArrowRight className="h-4 w-4" aria-hidden /></Go> : null
  if (s(section, 'layout') === 'split' && s(section, 'imageUrl')) {
    return (
      <section className="container mx-auto px-4 pt-20">
        <div className={`grid overflow-hidden bg-brand-800 text-white md:grid-cols-2 ${box}`}>
          <Frame src={s(section, 'imageUrl')} ratio={s(section, 'ratio')} focal={s(section, 'imageFocal')} className="!rounded-none" width={900} />
          <div className="flex flex-col justify-center p-8 md:p-12"><h2 className="font-playfair text-3xl font-bold tracking-tight md:text-4xl">{s(section, 'title')}</h2>{s(section, 'text') && <p className="mt-3 text-white/85">{s(section, 'text')}</p>}{action && <div className="mt-6">{action}</div>}</div>
        </div>
      </section>
    )
  }
  return (
    <section className="mt-16 bg-brand-700 text-white">
      <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 py-6 text-center md:flex-row md:text-left">
        <p><span className="text-lg font-bold">{s(section, 'title')}</span>{s(section, 'text') && <span className="mt-1 block text-white/85 md:ml-3 md:mt-0 md:inline">{s(section, 'text')}</span>}</p>
        {action}
      </div>
    </section>
  )
}

// ============================================================================ 9. Newsletter / call to action
function Cta({ section }: Props) {
  const signup = on(section, 'signup')
  const inner = (dark: boolean) => (
    <>
      <h2 className={`font-playfair text-3xl font-bold tracking-tight md:text-4xl ${dark ? '' : 'text-gray-900'}`}>{s(section, 'title')}</h2>
      {s(section, 'text') && <p className={`mx-auto mt-3 max-w-xl ${dark ? 'text-white/80' : 'text-gray-600'}`}>{s(section, 'text')}</p>}
      {signup ? <NewsletterForm dark={dark} /> : s(section, 'label') ? <Go href={s(section, 'link') || '/shop'} className={`mt-8 ${dark ? btnLight : btnPrimary}`}>{s(section, 'label')}<ArrowRight className="h-4 w-4" aria-hidden /></Go> : null}
    </>
  )
  if (s(section, 'layout') === 'split' && s(section, 'imageUrl')) {
    return (
      <section className="container mx-auto px-4 pt-24">
        <div className={`grid items-center overflow-hidden bg-brand-50 ring-1 ring-brand-100 md:grid-cols-2 ${box}`}>
          <Frame src={s(section, 'imageUrl')} ratio="4:5" focal={s(section, 'imageFocal')} className="!rounded-none max-md:!aspect-video" width={900} />
          <div className="p-8 text-center md:p-12">{inner(false)}</div>
        </div>
      </section>
    )
  }
  return <section className="container mx-auto px-4 pt-24"><div className={`bg-brand-800 px-6 py-14 text-center text-white ${box}`}>{inner(true)}</div></section>
}

// ============================================================================ 10. FAQ
function Faq({ section }: Props) {
  if (section.blocks.length === 0) return null
  const two = s(section, 'layout') === 'two'
  return (
    <section className={`mx-auto px-4 pt-24 ${two ? 'container' : 'max-w-3xl'}`} aria-labelledby={`h-${section.id}`}>
      <h2 id={`h-${section.id}`} className={`${heading} text-center`}>{s(section, 'title') || 'Questions, answered'}</h2>
      <div className={`mt-8 ${two ? 'grid gap-x-12 md:grid-cols-2' : 'divide-y divide-gray-200 border-y border-gray-200'}`}>
        {section.blocks.map((b) => (
          <details key={b.id} className={`group py-5 ${two ? 'border-b border-gray-200' : ''}`}><summary className="flex cursor-pointer list-none justify-between gap-4 font-semibold text-gray-900">{s(b, 'q')}<span className="text-xl leading-none text-gray-400 transition-transform group-open:rotate-45" aria-hidden>+</span></summary><p className="mt-3 leading-relaxed text-gray-600">{s(b, 'a')}</p></details>
        ))}
      </div>
    </section>
  )
}

// ============================================================================ classic sections
function Highlights({ section }: Props) {
  if (section.blocks.length === 0) return null
  return (
    <section aria-label="Why shop with us" className="border-y border-gray-100 bg-white">
      <ul className="container mx-auto grid gap-6 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
        {section.blocks.map((b) => (
          <li key={b.id} className="flex gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700"><TrustIcon name={s(b, 'icon') as Icon} className="h-5 w-5" /></span>
            <span><span className="block font-semibold text-gray-900">{s(b, 'title')}</span>{s(b, 'text') && <span className="text-sm text-gray-600">{s(b, 'text')}</span>}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
function Benefits({ section }: Props) {
  if (section.blocks.length === 0) return null
  return (
    <section className="container mx-auto px-4 pt-24" aria-labelledby={`h-${section.id}`}>
      <div className={`bg-brand-50 px-6 py-12 ring-1 ring-brand-100 md:px-12 ${box}`}>
        <h2 id={`h-${section.id}`} className={`${heading} text-center`}>{s(section, 'title')}</h2>
        <ul className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
          {section.blocks.map((b) => <li key={b.id} className="flex items-start gap-3 text-gray-800"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-700 text-white"><Check className="h-4 w-4" aria-hidden /></span>{s(b, 'text')}</li>)}
        </ul>
      </div>
    </section>
  )
}

// ============================================================================ the product page's own sections
/** Shown in the editor's preview when the store has nothing to show yet; customers never see it. */
const Empty = ({ text }: { text: string }) => <section className="container mx-auto px-4 py-16"><p className={`border-2 border-dashed border-gray-300 p-12 text-center text-gray-500 ${box}`}>{text}</p></section>
const Crumbs = ({ last, center = false }: { last?: string; center?: boolean }) => (
  <nav aria-label="Breadcrumb" className={`mb-6 text-sm text-gray-500 ${center ? 'text-center' : ''}`}>
    <Link href="/" className="hover:text-brand-700">Home</Link><span aria-hidden> / </span><Link href="/shop" className="hover:text-brand-700">Shop</Link>{last && <><span aria-hidden> / </span><span className="text-gray-800" aria-current="page">{last}</span></>}
  </nav>
)
const tint = (section: Section) => (s(section, 'background') === 'plain' ? 'bg-white' : 'bg-gradient-to-b from-brand-50 to-white')

function ProductMain({ section, data }: Props) {
  const d = data.product?.page
  if (!d) return <Empty text="Your product’s photos and buy box appear here. Add a product to see them." />
  const layout = s(section, 'layout'), stacked = layout === 'stacked'
  const keyBenefits = d.sections.find((x) => x.type === 'KEY_BENEFITS') ?? null
  return (
    <section className={`py-8 md:py-14 ${tint(section)}`}>
      <div className="container mx-auto px-4">
        {on(section, 'breadcrumb') && <Crumbs last={d.product.name} />}
        <div className={stacked ? 'mx-auto grid max-w-3xl gap-10' : 'grid items-start gap-10 lg:grid-cols-2 lg:gap-16'}>
          <div className={layout === 'media-right' ? 'lg:order-2' : ''}><ProductGallery media={d.media} productName={d.product.name} ratio={ratioCss(s(section, 'ratio'))} sticky={!stacked && on(section, 'stickyMedia')} /></div>
          <PurchasePanel data={d} keyBenefits={keyBenefits} />
        </div>
      </div>
    </section>
  )
}
function ProductInfo({ section, data }: Props) {
  const d = data.product?.page
  if (!d) return null
  const layout = s(section, 'layout')
  return <ProductTabs data={d} layout={layout === 'accordion' || layout === 'stacked' ? layout : 'tabs'} reviews={on(section, 'reviews')} />
}
function ProductFaq({ section, data }: Props) {
  const d = data.product?.page
  const faq = d && d.settings.showFaq ? d.sections.find((x) => x.type === 'FAQ') : null
  return faq ? <ProductFaqList section={faq} title={s(section, 'title')} /> : null
}
function RelatedProducts({ section, data }: Props) {
  const list = (data.product?.related ?? []).slice(0, Number(s(section, 'count')) || 4)
  if (list.length === 0) return null
  const layout = s(section, 'layout')
  const card = (item: CatalogItem) => <div className="flex w-full"><ProductCard item={item} currency={data.store.currency} /></div>
  return (
    <section className="container mx-auto px-4 pt-16" aria-labelledby={`h-${section.id}`}>
      <h2 id={`h-${section.id}`} className="font-playfair text-2xl font-bold text-gray-900 md:text-3xl">{s(section, 'title') || 'You may also like'}</h2>
      {layout === 'carousel' ? <ul className={`mt-6 ${row}`} tabIndex={0}>{list.map((item) => <li key={item.id} className="flex w-[70%] shrink-0 snap-start sm:w-[42%] lg:w-[23.5%]">{card(item)}</li>)}</ul>
        : <ul className={`mt-6 grid grid-cols-2 gap-4 sm:gap-6 ${layout === 'grid-3' ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>{list.map((item) => <li key={item.id} className="flex">{card(item)}</li>)}</ul>}
    </section>
  )
}

// ============================================================================ the collection page's own section
const GRID: Record<string, string> = { '2': 'grid-cols-1 sm:grid-cols-2', '3': 'grid-cols-2 lg:grid-cols-3', '4': 'grid-cols-2 lg:grid-cols-4' }
function CollectionMain({ section, data, first }: Props) {
  const c = data.collection
  if (!c) return <Empty text="A collection’s name and products appear here. Make a collection to see them." />
  const layout = s(section, 'layout'), left = layout !== 'centered'
  return (
    <div className={`${tint(section)} pb-12`}>
      <section className={`border-b border-brand-100 ${layout === 'compact' ? 'py-6' : 'py-12'} ${left ? '' : 'text-center'}`}>
        <div className="container mx-auto px-4">
          {on(section, 'breadcrumb') && <Crumbs center={!left} />}
          <h1 className={`font-playfair font-bold text-gray-900 ${layout === 'compact' ? 'text-2xl md:text-3xl' : 'text-4xl md:text-5xl'}`}>{c.title}</h1>
          {c.description && layout !== 'compact' && <p className={`mt-3 max-w-xl text-gray-600 ${left ? '' : 'mx-auto'}`}>{c.description}</p>}
          {on(section, 'count') && c.items.length > 0 && <p className="mt-2 text-sm text-gray-500">{c.items.length} product{c.items.length === 1 ? '' : 's'}</p>}
        </div>
      </section>
      <div className="container mx-auto px-4 pt-8">
        {c.items.length === 0
          ? <p className="py-16 text-center text-gray-600">Nothing here yet. <Link href="/shop" className="text-brand-700 underline">Browse the whole shop</Link>.</p>
          : <ul className={`grid gap-4 sm:gap-6 ${GRID[s(section, 'columns')] ?? GRID['4']}`}>{c.items.map((item, i) => <li key={item.id} className="flex"><div className="flex w-full"><ProductCard item={item} currency={data.store.currency} priority={first && i < 4} /></div></li>)}</ul>}
      </div>
    </div>
  )
}

/**
 * THE COMPONENT REGISTRY: section type -> the component that draws it. The names here must match the types in
 * lib/theme/schema.ts (a test checks that every described section has a component and the other way round).
 */
export const SECTION_COMPONENTS: Record<string, (p: Props) => ReactNode> = {
  hero: Hero, 'product-grid': ProductGrid, 'category-list': CategoryList, gallery: Gallery, story: Story, video: Video, reviews: Reviews, banner: Banner, cta: Cta, faq: Faq,
  highlights: Highlights, benefits: Benefits, 'collection-list': CollectionList,
  'product-main': ProductMain, 'product-info': ProductInfo, 'product-faq': ProductFaq, 'related-products': RelatedProducts, 'collection-main': CollectionMain,
}

/**
 * Draws a page from its template: each visible section, in order, through the registry.
 * `mark` (the editor's live preview only) outlines one section so the owner sees which one they are changing.
 */
export function RenderSections({ sections, data, mark, ownHeading = false }: { sections: Section[]; data: SectionData; mark?: string | null; /** The page has its own main heading (a product's or collection's name), so no section claims it. */ ownHeading?: boolean }) {
  const visible = sections.filter((x) => !x.hidden)
  const outline: CSSProperties = { outline: '3px solid #2563eb', outlineOffset: '-3px' }
  return <>{visible.map((section, i) => {
    const C = SECTION_COMPONENTS[section.type]
    return C ? <div key={section.id} data-section-id={section.id} style={mark === section.id ? outline : undefined}><C section={section} data={data} first={i === 0} lead={i === 0 && !ownHeading} /></div> : null
  })}</>
}
