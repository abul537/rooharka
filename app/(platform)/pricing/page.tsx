import type { Metadata } from 'next'
import PlanCards, { IncludedInAll } from '@/components/platform/PlanCards'
import { getPlatformSettings } from '@/lib/signup/store'
import { getPublicPlans } from '@/lib/signup/public-plans'

export const metadata: Metadata = { title: 'Pricing' }
export const dynamic = 'force-dynamic'

export default async function PricingPage() {
  const [s, plans] = await Promise.all([getPlatformSettings(), getPublicPlans()])
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-16">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Pricing that grows with your store</h1>
        <p className="mt-4 text-stone-600">{s.trialDays > 0 ? `Try any plan free for ${s.trialDays} days. No card needed.` : 'Choose the plan that fits your store.'}</p>
      </div>
      <PlanCards plans={plans} trialDays={s.trialDays} />
      <IncludedInAll />
    </div>
  )
}
