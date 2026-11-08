import { db } from '@/lib/db'
import { requirePlatform } from '@/lib/csmi/guard'
import { canPlatform } from '@/lib/csmi/rules'
import ActionForm from '@/components/admin/ActionForm'
import { Card, Check, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { savePlanAction } from '../actions'
import { FEATURE_LABELS, readLimits } from '@/lib/signup/plans'

export const dynamic = 'force-dynamic'

export default async function PlansPage() {
  const user = await requirePlatform()
  const manage = canPlatform(user.role, 'csmi.manage')
  const plans = await db.plan.findMany({ orderBy: [{ sortOrder: 'asc' }, { monthlyPrice: 'asc' }], include: { _count: { select: { subscriptions: true } } } })

  const lim = (p?: (typeof plans)[number]) => readLimits(p?.limits)
  const form = (p?: (typeof plans)[number]) => (
    <ActionForm action={savePlanAction} className="grid sm:grid-cols-[1.2fr_1fr_1fr_auto_auto] gap-3 items-end">
      {/* pricing-page wording, second row below */}
      {p && <input type="hidden" name="planId" value={p.id} />}
      <Field label="Name"><input name="name" defaultValue={p?.name ?? ''} required maxLength={40} className={inputCls} /></Field>
      <Field label="Monthly price (Rs.)"><input name="monthlyPrice" inputMode="decimal" defaultValue={p ? p.monthlyPrice.toNumber() : ''} required className={inputCls} /></Field>
      <Field label="Yearly price (optional)"><input name="yearlyPrice" inputMode="decimal" defaultValue={p?.yearlyPrice ? p.yearlyPrice.toNumber() : ''} className={inputCls} /></Field>
      <Check name="isActive" label="Offered" defaultChecked={p?.isActive ?? true} />
      <button className={primaryBtn}>{p ? 'Save' : 'Add plan'}</button>
      <div className="sm:col-span-5 grid sm:grid-cols-[1fr_1fr_1fr_2fr_auto] gap-3 items-end border-t border-slate-100 pt-3">
        <Field label="Products limit" hint="Empty = unlimited"><input name="limitProducts" inputMode="numeric" defaultValue={lim(p).products ?? ''} className={inputCls} /></Field>
        <Field label="Orders / month"><input name="limitOrders" inputMode="numeric" defaultValue={lim(p).ordersPerMonth ?? ''} className={inputCls} /></Field>
        <Field label="Staff logins"><input name="limitStaff" inputMode="numeric" defaultValue={lim(p).staff ?? ''} className={inputCls} /></Field>
        <Field label="Tagline on pricing page"><input name="tagline" maxLength={90} defaultValue={lim(p).tagline} className={inputCls} /></Field>
        <Check name="popular" label="Most popular" defaultChecked={lim(p).popular} />
      </div>
      <div className="sm:col-span-5 grid sm:grid-cols-[auto_1fr_auto] gap-3 items-end border-t border-slate-100 pt-3">
        <Check name="isPublic" label="Show on pricing page and sign-up" defaultChecked={p?.isPublic ?? true} />
        <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm"><legend className="text-xs text-slate-500 mb-1">Included services (listed on the pricing page)</legend>
          {Object.entries(FEATURE_LABELS).map(([k, label]) => (
            <label key={k} className="flex items-center gap-1.5"><input type="checkbox" name={`feature_${k}`} defaultChecked={Array.isArray(p?.features) && (p.features as unknown[]).includes(k)} /> {label}</label>
          ))}
        </fieldset>
        <Field label="Order" hint="Lowest first"><input name="sortOrder" inputMode="numeric" defaultValue={p?.sortOrder ?? 0} className={`${inputCls} w-20`} /></Field>
      </div>
    </ActionForm>
  )

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">Plans</h1>
      <p className="text-sm text-slate-600">What you sell to store owners. A store can have a negotiated price on top (set on the store's page). Switching a plan off hides it from new stores; existing stores keep it. Changing a price changes what existing stores on that plan are billed from their next invoice. To make a tailor-made plan for one client, add a plan and untick “Show on pricing page”: visitors never see it, and you give it to the store from its page. The limits, tagline, included services and “Most popular” are shown on the public pricing page; the limits are not enforced by the platform yet, so treat them as promises you keep by hand.</p>
      <p className="text-sm"><a href="/csmi/offers" className="underline font-medium">Offers and discount codes</a></p>
      {manage && <Card title="Add a plan">{form()}</Card>}
      <Card title="Your plans">
        {plans.length === 0 ? <p className="text-sm text-slate-500">No plans yet. Add one above, then give stores a plan from their page.</p> : (
          <div className="space-y-5 divide-y divide-slate-100">
            {plans.map((p) => (
              <div key={p.id} className="pt-4 first:pt-0">
                <p className="text-xs text-slate-500 mb-2">{p._count.subscriptions} store{p._count.subscriptions === 1 ? '' : 's'} on this plan{!p.isPublic ? ' · PRIVATE (tailor-made: hidden from visitors, assign it from the store page)' : ''}</p>
                {manage ? form(p) : <p className="text-sm">{p.name}: Rs. {p.monthlyPrice.toNumber().toLocaleString('en-PK')}/month{p.isActive ? '' : ' (switched off)'}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
