import MediaImage from '@/components/media/MediaImage'
import Link from 'next/link'
import { Star } from 'lucide-react'
import { discountPercent, type CatalogItem } from '@/lib/catalog'
import { formatPrice } from '@/lib/format'

/** One product tile in the shop grid. The whole card is a single link to the product page. */
export default function ProductCard({ item, currency, priority = false }: { item: CatalogItem; currency: string; priority?: boolean }) {
  const off = discountPercent(item)
  const hasRange = item.maxPrice > item.minPrice
  return (
    <Link
      href={`/product/${item.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-amber-100 transition hover:-translate-y-1 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-amber-600"
    >
      <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-amber-100 to-emerald-100">
        {item.imageUrl ? (
          <MediaImage
            src={item.imageUrl} width={600} alt={item.imageAlt ?? item.name} fill priority={priority}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className={`object-cover transition duration-500 group-hover:scale-105 ${item.soldOut ? 'opacity-60 grayscale' : ''}`}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-5xl" aria-hidden>🫙</div>
        )}
        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {item.soldOut && <span className="rounded-full bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white">Sold out</span>}
          {!item.soldOut && off && <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">{off}% off</span>}
          {item.isFeatured && !item.soldOut && <span className="rounded-full bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white">Featured</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-playfair text-lg font-bold leading-snug text-gray-900 group-hover:text-amber-800">{item.name}</h3>
        {item.subtitle && <p className="mt-0.5 line-clamp-1 text-sm text-gray-500">{item.subtitle}</p>}
        {item.rating !== null && (
          <p className="mt-2 flex items-center gap-1 text-sm text-gray-600" aria-label={`Rated ${item.rating} out of 5 from ${item.ratingCount} reviews`}>
            <Star className="h-4 w-4 fill-amber-500 text-amber-500" aria-hidden /> <span className="font-medium">{item.rating}</span>
            <span className="text-gray-400">({item.ratingCount})</span>
          </p>
        )}
        <p className="mt-auto pt-3 text-lg font-bold text-gray-900">
          {hasRange && <span className="mr-1 text-sm font-normal text-gray-500">From</span>}
          {formatPrice(item.minPrice, currency)}
          {off && !hasRange && item.compareAt && <span className="ml-2 text-sm font-normal text-gray-400 line-through">{formatPrice(item.compareAt, currency)}</span>}
        </p>
      </div>
    </Link>
  )
}
