import type { ReviewDTO } from '@/lib/data/product'

export function Stars({ value, size = 'text-xl' }: { value: number; size?: string }) {
  const full = Math.round(value)
  return (
    <span className={`inline-flex ${size}`} role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= full ? 'text-amber-500' : 'text-gray-300'} aria-hidden>★</span>
      ))}
    </span>
  )
}

/** Only genuine, approved reviews are ever shown. No reviews yet = a polite empty state. */
export default function Reviews({ items, count, average }: { items: ReviewDTO[]; count: number; average: number | null }) {
  return (
    <div>
      <h2 className="font-playfair text-4xl font-bold text-gray-900 mb-4">Customer Experiences</h2>
      {average !== null && count > 0 && (
        <div className="flex items-center gap-3 mb-8">
          <Stars value={average} />
          <span className="text-gray-600">{average.toFixed(1)} out of 5 · {count} review{count === 1 ? '' : 's'}</span>
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-gray-600 bg-amber-50 rounded-2xl p-8">
          No reviews yet. Be the first to share your experience after your order arrives.
        </p>
      ) : (
        <div className="space-y-6">
          {items.map((r) => (
            <article key={r.id} className="bg-white border border-gray-200 rounded-2xl p-8">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <Stars value={r.rating} size="text-base" />
                {r.isVerified && (
                  <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded text-xs">Verified Purchase</span>
                )}
              </div>
              <h3 className="font-bold text-lg">{r.authorName}{r.city ? `, ${r.city}` : ''}</h3>
              <p className="text-gray-500 text-sm mb-4">{r.date}</p>
              <p className="text-gray-700">{r.body}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
