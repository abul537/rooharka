import { Bar, FormField, Skeleton } from '@/components/shop/Skeletons'

/** ORDER TRACKING skeleton: the icon and title, then the card where the customer types the tracking code. */
export default function TrackLoading() {
  return (
    <Skeleton label="order tracking" className="min-h-[70vh] bg-gradient-to-b from-brand-50 to-white px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex flex-col items-center"><div className="mb-3 h-12 w-12 rounded-full bg-gray-200" /><Bar className="h-10 w-2/3" /><Bar className="mt-3 h-4 w-1/2" /></div>
        <div className="space-y-4 rounded-2xl bg-white p-6 shadow-xl"><FormField /><FormField /><div className="h-12 rounded-lg bg-gray-200" /></div>
      </div>
    </Skeleton>
  )
}
