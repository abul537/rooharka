import { Bar, FormField, PageTitle, Skeleton, SummaryBox } from '@/components/shop/Skeletons'

/** CHECKOUT skeleton: the title, the steps, the delivery form on the left and the order summary on the right. */
export default function CheckoutLoading() {
  return (
    <Skeleton label="checkout" className="min-h-screen bg-gradient-to-b from-brand-50 to-white pt-8 pb-20">
      <PageTitle band={false} />
      <div className="container mx-auto max-w-5xl px-4">
        <div className="mx-auto mb-8 flex max-w-md items-center justify-between">{[0, 1, 2].map((i) => <div key={i} className="h-9 w-9 rounded-full bg-gray-200" />)}</div>
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-5 rounded-2xl bg-white p-6 shadow-sm">
            <Bar className="h-7 w-1/3" />
            <div className="grid gap-5 sm:grid-cols-2"><FormField /><FormField /></div>
            <div className="grid gap-5 sm:grid-cols-2"><FormField /><FormField /></div>
            <FormField />
            <div className="h-14 rounded-xl bg-gray-200" />
          </div>
          <SummaryBox rows={3} />
        </div>
      </div>
    </Skeleton>
  )
}
