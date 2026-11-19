import { PageTitle, FormField, Skeleton } from '@/components/shop/Skeletons'

/** PHONE CHECK skeleton: a narrow column with the title, the code box and the button. */
export default function VerifyLoading() {
  return (
    <Skeleton label="phone check" className="min-h-screen bg-gradient-to-b from-brand-50 to-white pt-10 pb-20">
      <PageTitle band={false} narrow />
      <div className="container mx-auto max-w-md space-y-4 px-4"><div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm"><FormField /><div className="h-12 rounded-xl bg-gray-200" /></div></div>
    </Skeleton>
  )
}
