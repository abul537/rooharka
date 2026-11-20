import type { Metadata } from 'next'
import PlanCards, { IncludedInAll } from '@/components/platform/PlanCards'
import { getPlatformSettings } from '@/lib/signup/store'
import { getPublicPlans } from '@/lib/signup/public-plans'
import CompareTable from '@/components/plans/CompareTable'
import { paysForItself } from '@/lib/plans/catalog'

export const metadata: Metadata = { title: 'Pricing' }
export const dynamic = 'force-dynamic'

export default async function PricingPage() {
  const [s, plans] = await Promise.all([getPlatformSettings(), getPublicPlans()])
  const basic = plans.find((p) => p.name === 'Basic'), pro = plans.find((p) => p.name === 'Pro')
  const saving = basic && pro ? paysForItself(basic.monthly, pro.monthly) : null
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-16">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Pricing that grows with your store</h1>
        <p className="mt-4 text-stone-600">{s.trialDays > 0 ? `Try any plan free for ${s.trialDays} days. No card needed.` : 'Choose the plan that fits your store.'}</p>
      </div>
      <PlanCards plans={plans} trialDays={s.trialDays} />
      {plans.length > 1 && (
        <section className="mt-20" aria-labelledby="compare">
          <h2 id="compare" className="mb-2 text-center text-3xl font-bold tracking-tight">Compare plans</h2>
          <p className="mx-auto mb-8 max-w-2xl text-center text-stone-600">{s.trialDays > 0 ? `Your ${s.trialDays}-day free trial includes every Pro feature, whichever plan you choose.` : 'Every plan, side by side.'}</p>
          <CompareTable plans={plans} />
          {saving && <p className="mx-auto mt-6 max-w-3xl rounded-xl bg-emerald-50 p-5 text-sm text-emerald-950"><strong>Why Pro pays for itself.</strong> {saving}</p>}
        </section>
      )}
      <IncludedInAll />
    </div>
  )
}
