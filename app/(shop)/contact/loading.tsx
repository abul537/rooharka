import { Bar, FormField, PageTitle, Skeleton } from '@/components/shop/Skeletons'

/** CONTACT skeleton: the heading band, the message form on the left and the shop's contact details on the right. */
export default function ContactLoading() {
  return (
    <Skeleton label="contact page" className="pb-8">
      <PageTitle />
      <div className="container mx-auto grid gap-10 px-4 pt-6 lg:grid-cols-[1fr_22rem] lg:gap-14">
        <div className="space-y-5">
          <Bar className="h-7 w-1/3" />
          <div className="grid gap-5 sm:grid-cols-2"><FormField /><FormField /></div>
          <FormField />
          <div><Bar className="mb-2 h-4 w-24" /><div className="h-36 rounded-lg border border-gray-200 bg-gray-100" /></div>
          <div className="h-12 w-40 rounded-xl bg-gray-200" />
        </div>
        <div className="h-fit space-y-5 rounded-2xl border border-gray-200 p-6">
          <Bar className="h-7 w-2/3" />
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="flex gap-3"><div className="h-5 w-5 shrink-0 rounded bg-gray-200" /><div className="flex-1"><Bar className="h-4 w-1/2" /><Bar className="mt-2 h-4 w-3/4" /></div></div>)}
        </div>
      </div>
    </Skeleton>
  )
}
