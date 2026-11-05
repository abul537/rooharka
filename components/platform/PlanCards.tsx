import Link from 'next/link'
import { Check } from 'lucide-react'
import { formatPrice } from '@/lib/format'
import { INCLUDED_IN_ALL, describePlan, yearlySaving } from '@/lib/signup/plans'

export interface PublicPlan { id: string; name: string; monthly: number; yearly: number | null; limits: unknown; features: unknown }

/** The plan cards, used on the home page and the pricing page. `compact` hides the long "included in all" list. */
export default function PlanCards({ plans, trialDays }: { plans: PublicPlan[]; trialDays: number }) {
  if (plans.length === 0) return <p className="text-center text-stone-600">Plans are being prepared. Please check back soon.</p>
  return (
    <div className={`grid gap-6 ${plans.length >= 3 ? 'lg:grid-cols-3' : plans.length === 2 ? 'md:grid-cols-2 max-w-3xl mx-auto' : 'max-w-md mx-auto'}`}>
      {plans.map((p) => {
        const d = describePlan(p)
        const save = yearlySaving(p.monthly, p.yearly)
        return (
          <section key={p.id} className={`relative rounded-2xl border bg-white p-7 flex flex-col ${d.popular ? 'border-emerald-600 shadow-lg ring-1 ring-emerald-600' : 'border-stone-200'}`}>
            {d.popular && <span className="absolute -top-3 left-7 rounded-full bg-emerald-700 text-white text-xs font-semibold px-3 py-1">Most popular</span>}
            <h3 className="text-xl font-bold">{p.name}</h3>
            {d.tagline && <p className="text-sm text-stone-600 mt-1">{d.tagline}</p>}
            <p className="mt-5"><span className="text-4xl font-bold tracking-tight">{formatPrice(p.monthly)}</span><span className="text-stone-500"> / month</span></p>
            <p className="text-sm text-stone-500 mt-1 min-h-5">{p.yearly ? `or ${formatPrice(p.yearly)} a year${save ? ` (save ${save}%)` : ''}` : ''}</p>
            <ul className="mt-6 space-y-2.5 text-sm flex-1">
              {d.bullets.map((b) => <li key={b} className="flex gap-2"><Check className="h-4 w-4 mt-0.5 shrink-0 text-emerald-700" aria-hidden />{b}</li>)}
            </ul>
            <Link href={`/signup?plan=${encodeURIComponent(p.id)}`} className={`mt-7 text-center rounded-lg px-5 py-3 font-semibold ${d.popular ? 'bg-emerald-700 text-white hover:bg-emerald-800' : 'bg-stone-900 text-white hover:bg-stone-800'}`}>
              {trialDays > 0 ? `Start ${trialDays}-day free trial` : `Choose ${p.name}`}
            </Link>
          </section>
        )
      })}
    </div>
  )
}

export function IncludedInAll() {
  return (
    <div className="rounded-2xl bg-stone-50 border border-stone-200 p-7 mt-10">
      <h3 className="font-semibold">Every plan includes</h3>
      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 text-sm">
        {INCLUDED_IN_ALL.map((b) => <li key={b} className="flex gap-2"><Check className="h-4 w-4 mt-0.5 shrink-0 text-emerald-700" aria-hidden />{b}</li>)}
      </ul>
      <p className="text-sm text-stone-600 mt-5">Couriers, SMS and wallet providers are paid by you, directly to them. We never add a markup to those.</p>
    </div>
  )
}
