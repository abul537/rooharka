import Link from 'next/link'

/** Shown inside the shop (with its header and footer) for an address that does not exist: a removed product, a typing mistake. */
export default function ShopNotFound() {
  return (
    <section className="container mx-auto px-4 py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Page not found</p>
      <h1 className="mt-3 font-playfair text-4xl font-bold text-gray-900">We could not find that page</h1>
      <p className="mx-auto mt-4 max-w-md text-gray-600">It may have been moved, or the product is no longer sold. Everything we have is in the shop.</p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Link href="/shop" className="rounded-[var(--r-btn,0.75rem)] bg-brand-700 px-7 py-3.5 font-semibold text-white hover:bg-brand-800">Browse the shop</Link>
        <Link href="/" className="rounded-[var(--r-btn,0.75rem)] border-2 border-brand-700 px-7 py-3.5 font-semibold text-brand-800 hover:bg-brand-50">Go to the home page</Link>
      </div>
    </section>
  )
}
