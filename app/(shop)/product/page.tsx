import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getFirstProductSlug } from '@/lib/data/product'

export const revalidate = 60

// /product -> the store's first (featured) product. Becomes the catalog page later.
export default async function ProductIndex() {
  const slug = await getFirstProductSlug()
  if (slug) redirect(`/product/${slug}`)
  return (
    <div className="container mx-auto px-4 py-32 text-center">
      <h1 className="font-playfair text-4xl font-bold text-gray-900 mb-4">No products yet</h1>
      <p className="text-gray-600 mb-8">This store hasn&apos;t published a product. Please check back soon.</p>
      <Link href="/" className="text-amber-700 font-medium underline">Back to home</Link>
    </div>
  )
}
