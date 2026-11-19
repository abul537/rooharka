import { Bar, Skeleton } from '@/components/shop/Skeletons'

/** ORDER PLACED skeleton: one centred card with the tick, the thank-you, the tracking-code box and two buttons. */
export default function SuccessLoading() {
  return (
    <Skeleton label="your order" className="min-h-[70vh] bg-gradient-to-b from-brand-50 to-white px-4 py-16">
      <div className="mx-auto flex max-w-xl flex-col items-center rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-4 h-16 w-16 rounded-full bg-gray-200" />
        <Bar className="h-8 w-2/3" />
        <Bar className="mt-3 mb-6 h-4 w-3/4" />
        <div className="mb-6 h-28 w-full rounded-xl bg-gray-100" />
        <div className="flex w-full flex-col justify-center gap-3 sm:flex-row"><div className="h-12 rounded-lg bg-gray-200 sm:w-40" /><div className="h-12 rounded-lg bg-gray-200 sm:w-40" /></div>
      </div>
    </Skeleton>
  )
}
