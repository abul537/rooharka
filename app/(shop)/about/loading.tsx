import { Bar, PageTitle, Paragraph, Skeleton } from '@/components/shop/Skeletons'

/** ABOUT skeleton: the heading band, a picture beside the shop's story, then a row of values. */
export default function AboutLoading() {
  return (
    <Skeleton label="about page">
      <PageTitle />
      <div className="container mx-auto grid items-center gap-10 px-4 py-14 lg:grid-cols-2 lg:gap-16">
        <div className="aspect-[4/5] rounded-3xl bg-gray-200" />
        <div><Bar className="mb-6 h-9 w-2/3" /><Paragraph lines={6} /></div>
      </div>
      <div className="container mx-auto grid gap-6 px-4 pb-16 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => <div key={i} className="rounded-2xl border border-gray-100 p-6"><div className="h-10 w-10 rounded-full bg-gray-200" /><Bar className="mt-4 h-5 w-1/2" /><Bar className="mt-3 h-4 w-full" /></div>)}
      </div>
    </Skeleton>
  )
}
