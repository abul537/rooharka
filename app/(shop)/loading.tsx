import { Bar, ProductGrid, Skeleton } from '@/components/shop/Skeletons'

/**
 * HOME PAGE skeleton: a large hero banner with its heading and button, a row of highlights, then a product grid,
 * the shape every starting theme's home page has. Every other shop page has its own skeleton next to it.
 */
export default function HomeLoading() {
  return (
    <Skeleton label="home page">
      <div className="bg-gray-100">
        <div className="container mx-auto flex min-h-[60vh] flex-col items-center justify-center px-4 py-20 md:min-h-[70vh]">
          <Bar className="h-12 w-3/4 max-w-2xl bg-gray-300 md:h-16" />
          <Bar className="mt-5 h-5 w-2/3 max-w-xl bg-gray-300" />
          <div className="mt-8 h-14 w-44 rounded-xl bg-gray-300" />
        </div>
      </div>
      <div className="container mx-auto grid grid-cols-2 gap-6 px-4 py-10 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="flex flex-col items-center"><div className="h-12 w-12 rounded-full bg-gray-200" /><Bar className="mt-3 h-4 w-2/3" /></div>)}
      </div>
      <div className="container mx-auto px-4 py-12">
        <div className="mb-8 flex flex-col items-center"><Bar className="h-9 w-1/2 max-w-sm" /><Bar className="mt-3 h-4 w-2/3 max-w-md" /></div>
        <ProductGrid count={8} />
      </div>
    </Skeleton>
  )
}
