import { Skeleton } from '@/components/shop/Skeletons'

/** PRODUCT skeleton: the picture on the left, name, price, description, options and buy button on the right. */
export default function ProductLoading() {
  return (
    <Skeleton label="product" className="container mx-auto px-4 py-10 md:py-16">
      <div className="grid lg:grid-cols-2 gap-10 lg:gap-16">
        <div className="aspect-square rounded-3xl bg-brand-100" />
        <div className="space-y-6">
          <div className="h-12 w-3/4 rounded bg-gray-200" />
          <div className="h-6 w-1/2 rounded bg-gray-200" />
          <div className="h-24 rounded bg-gray-200" />
          <div className="h-10 w-1/3 rounded bg-gray-200" />
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-xl bg-gray-200" />)}
          </div>
          <div className="h-14 rounded-xl bg-gray-200" />
        </div>
      </div>
    </Skeleton>
  )
}
