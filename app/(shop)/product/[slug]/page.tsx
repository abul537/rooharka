import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getProductPageData } from '@/lib/data/product'
import Gallery from '@/components/product/Gallery'
import PurchasePanel from '@/components/product/PurchasePanel'
import ProductTabs from '@/components/product/ProductTabs'
import Faq from '@/components/product/Faq'

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
  const description = product.seoDescription ?? product.shortDescription ?? undefined
  const image = media.find((m) => m.kind === 'IMAGE')?.url
  return {
    title,
    description,
    openGraph: { title, description, type: 'website', images: image ? [image] : undefined },
  }
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params
  const data = await getProductPageData(slug)
  if (!data) notFound()

  const { product, variants, media, sections, settings, reviews, store } = data
  const keyBenefits = sections.find((s) => s.type === 'KEY_BENEFITS') ?? null
  const faq = settings.showFaq ? sections.find((s) => s.type === 'FAQ') ?? null : null

  // Structured data so search engines can show price, stock and rating.
  const prices = variants.map((v) => v.price)
  const inStock = variants.some((v) => !v.trackStock || v.stock > 0)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription ?? undefined,
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
    <div className="pt-4 pb-24 lg:pb-8">
      <script
        type="application/ld+json"
        // "<" is escaped so product text can never close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <section className="py-10 md:py-16 bg-gradient-to-b from-amber-50 to-white">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
            <Gallery media={media} productName={product.name} />
            <PurchasePanel data={data} keyBenefits={keyBenefits} />
          </div>
        </div>
      </section>

      <ProductTabs data={data} />
      {faq && <Faq section={faq} />}
    </div>
  )
}
