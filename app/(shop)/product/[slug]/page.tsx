import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getProductPageData } from '@/lib/data/product'
import { getCatalog } from '@/lib/data/catalog'
import { relatedItems } from '@/lib/catalog'
import { getShopContext } from '@/lib/storefront/data'
import { loadSectionData } from '@/lib/theme/page-data'
import { RenderSections } from '@/components/sections/registry'

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

  const { product, variants, media, reviews, store } = data
  // The page is DRAWN from the theme's "product" template: the product's own sections (photos and buy box,
  // description, questions, related products) in the owner's order, with any other sections around them.
  const { sections } = (await getShopContext(store)).pages.product
  const [base, catalog] = await Promise.all([loadSectionData(store, sections), getCatalog(store.id)])
  const sectionData = { ...base, product: { page: data, related: relatedItems(catalog.items, product.slug, 8) } }

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
      <RenderSections sections={sections} data={sectionData} ownHeading />
    </div>
  )
}
