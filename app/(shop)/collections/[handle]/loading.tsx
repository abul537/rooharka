import { Bar, PageTitle, ProductGrid, Skeleton } from '@/components/shop/Skeletons'

/** COLLECTION skeleton: the collection's heading and description, the product count, then its products. */
export default function CollectionLoading() {
  return (
    <Skeleton label="collection">
      <PageTitle />
      <div className="container mx-auto px-4 pb-16">
        <Bar className="mb-6 h-4 w-28" />
        <ProductGrid count={8} />
      </div>
    </Skeleton>
  )
}
