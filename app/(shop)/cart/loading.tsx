import { Bar, Skeleton, SummaryBox } from '@/components/shop/Skeletons'

/** CART skeleton: the title, the cart's lines (picture, name, quantity, price) on the left and the totals on the right. */
export default function CartLoading() {
  return (
    <Skeleton label="cart" className="container mx-auto max-w-5xl px-4 py-10">
      <Bar className="mb-8 h-10 w-48" />
      <div className="grid items-start gap-8 lg:grid-cols-[1fr_340px]">
        <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200">
          {Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="flex gap-4 p-4">
              <div className="h-24 w-24 shrink-0 rounded-xl bg-gray-200" />
              <div className="flex-1"><Bar className="h-5 w-2/3" /><Bar className="mt-2 h-4 w-1/3" /><div className="mt-3 h-9 w-28 rounded-lg bg-gray-200" /></div>
              <Bar className="h-5 w-16 shrink-0" />
            </li>
          ))}
        </ul>
        <SummaryBox rows={1} />
      </div>
    </Skeleton>
  )
}
