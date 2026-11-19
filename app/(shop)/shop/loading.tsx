import { Bar, PageTitle, ProductGrid, Skeleton } from '@/components/shop/Skeletons'

/** CATALOGUE skeleton: the title band, the category chips, the search and sort bar, then the product grid. */
export default function ShopLoading() {
  return (
    <Skeleton label="products" className="bg-gradient-to-b from-brand-50 to-white pb-20">
      <div className="border-b border-brand-100 pt-12"><PageTitle band={false} /></div>
      <div className="container mx-auto px-4 pt-8">
        <div className="mb-5 flex flex-wrap gap-2">{[20, 24, 16, 28, 20].map((w, i) => <div key={i} className="h-8 rounded-full bg-gray-200" style={{ width: `${w * 4}px` }} />)}</div>
        <div className="mb-8 flex flex-col gap-3 sm:flex-row"><div className="h-12 flex-1 rounded-xl bg-gray-200" /><div className="h-12 rounded-xl bg-gray-200 sm:w-48" /></div>
        <ProductGrid count={12} />
      </div>
    </Skeleton>
  )
}
