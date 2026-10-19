import Link from 'next/link'

export default function ProductNotFound() {
  return (
    <div className="container mx-auto px-4 py-32 text-center">
      <h1 className="font-playfair text-4xl font-bold text-gray-900 mb-4">Product not found</h1>
      <p className="text-gray-600 mb-8">This product may have been removed or is no longer available.</p>
      <Link href="/shop" className="inline-block bg-amber-700 text-white px-6 py-3 rounded-xl font-bold">
        View our products
      </Link>
    </div>
  )
}
