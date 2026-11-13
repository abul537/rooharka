import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getProductPageData } from '@/lib/data/product'
import Gallery from '@/components/product/Gallery'
import PurchasePanel from '@/components/product/PurchasePanel'
import ProductTabs from '@/components/product/ProductTabs'
import Faq from '@/components/product/Faq'
import Link from 'next/link'
import ProductCard from '@/components/shop/ProductCard'
import { getCatalog } from '@/lib/data/catalog'
import { relatedItems } from '@/lib/catalog'

// Pages are rebuilt in the background at most once a minute, so dashboard edits
// go live quickly without hitting the database on every visit.
export const revalidate = 60

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const data = await getProductPageData(slug)
  if (!data) return { title: 'Product not found' }
  const { product, media, store } = data
  const title = product.seoTitle ?? `${product.name}${product.subtitle ? `: ${product.subtitle}` : ''} | ${store.name}`
  // No search description typed: fall back to the short description, then to the first 150 characters of the description.
  const description = product.seoDescription ?? product.shortDescription ?? product.descriptionText ?? undefined
  const image = media.find((m) => m.kind === 'IMAGE')?.url
  const host = (await headers()).get('host')
  return {
    title,
    description,
    // One official address per product, so search engines do not see copies (?utm=..., other hosts) as separate pages.
    alternates: host ? { canonical: `https://${host}/product/${product.slug}` } : undefined,
    openGraph: { title, description, type: 'website', images: image ? [image] : undefined },
  }
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params
  const data = await getProductPageData(slug)
  if (!data) notFound()

  const { product, variants, media, sections, settings, reviews, store } = data
  const related = relatedItems((await getCatalog(store.id)).items, product.slug)
  const keyBenefits = sections.find((s) => s.type === 'KEY_BENEFITS') ?? null
  const faq = settings.showFaq ? sections.find((s) => s.type === 'FAQ') ?? null : null

  // Structured data so search engines can show price, stock and rating.
  const prices = variants.map((v) => v.price)
  const inStock = variants.some((v) => !v.trackStock || v.stock > 0)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription ?? product.descriptionText ?? undefined,
    image: media.filter((m) => m.kind === 'IMAGE').map((m) => m.url),
    brand: { '@type': 'Brand', name: store.name },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: store.currency,
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: variants.length,
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
    ...(reviews.average !== null && reviews.count > 0
      ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: reviews.average.toFixed(1), reviewCount: reviews.count } }
      : {}),
  }

  return (
    <div className="pb-24 lg:pb-8">
      <script
        type="application/ld+json"
        // "<" is escaped so product text can never close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      {product.isDraft && (
        <p role="note" className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">
          Draft: only you can see this product. Set its status to Active in your dashboard when it is ready. Customers cannot order it yet.
        </p>
      )}
      <section className="py-8 md:py-14 bg-gradient-to-b from-brand-50 to-white">
        <div className="container mx-auto px-4">
          <nav aria-label="Breadcrumb" className="mb-6 text-sm text-gray-500">
            <Link href="/" className="hover:text-brand-700">Home</Link><span aria-hidden> / </span><Link href="/shop" className="hover:text-brand-700">Shop</Link><span aria-hidden> / </span><span className="text-gray-800" aria-current="page">{product.name}</span>
          </nav>
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
            <Gallery media={media} productName={product.name} />
            <PurchasePanel data={data} keyBenefits={keyBenefits} />
          </div>
        </div>
      </section>

      <ProductTabs data={data} />
      {faq && <Faq section={faq} />}

      {related.length > 0 && (
        <section className="container mx-auto px-4 pt-16" aria-labelledby="related">
          <h2 id="related" className="font-playfair text-2xl font-bold text-gray-900 md:text-3xl">You may also like</h2>
          <ul className="mt-6 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {related.map((item) => <li key={item.id} className="flex"><div className="flex w-full"><ProductCard item={item} currency={store.currency} /></div></li>)}
          </ul>
        </section>
      )}
    </div>
  )
}
