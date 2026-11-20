import { db } from '@/lib/db'
import { requirePlatform } from '@/lib/csmi/guard'
import { canPlatform } from '@/lib/csmi/rules'
import ActionForm from '@/components/admin/ActionForm'
import { Card, Check, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { installPlansAction, savePlanAction } from '../actions'
import { INCLUDED_IN_ALL, PRO_FEATURES, RECOMMENDED_PLANS } from '@/lib/plans/catalog'
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
      <div className="sm:col-span-5 grid sm:grid-cols-[1fr_1fr_1fr_1fr_2fr_auto] gap-3 items-end border-t border-slate-100 pt-3">
        <Field label="Products limit" hint="Empty = unlimited"><input name="limitProducts" inputMode="numeric" defaultValue={lim(p).products ?? ''} className={inputCls} /></Field>
        <Field label="Orders / month"><input name="limitOrders" inputMode="numeric" defaultValue={lim(p).ordersPerMonth ?? ''} className={inputCls} /></Field>
        <Field label="Staff logins" hint="0 = owner only. Empty = unlimited"><input name="limitStaff" inputMode="numeric" defaultValue={lim(p).staff ?? ''} className={inputCls} /></Field>
        <Field label="Video size (MB)" hint="Empty = 20 MB"><input name="limitVideoMb" inputMode="numeric" defaultValue={lim(p).videoMb ?? ''} className={inputCls} /></Field>
        <Field label="Tagline on pricing page"><input name="tagline" maxLength={90} defaultValue={lim(p).tagline} className={inputCls} /></Field>
        <Check name="popular" label="Most popular" defaultChecked={lim(p).popular} />
      </div>
      <div className="sm:col-span-5 grid sm:grid-cols-[auto_1fr_auto] gap-3 items-end border-t border-slate-100 pt-3">
        <Check name="isPublic" label="Show on pricing page and sign-up" defaultChecked={p?.isPublic ?? true} />
        <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm"><legend className="text-xs text-slate-500 mb-1">Pro features this plan includes (switched on for its stores and listed on the pricing page)</legend>
          {Object.entries(FEATURE_LABELS).map(([k, label]) => (
            <label key={k} title={PRO_FEATURES[k as keyof typeof PRO_FEATURES]?.why} className="flex items-center gap-1.5"><input type="checkbox" name={`feature_${k}`} defaultChecked={Array.isArray(p?.features) && (p.features as unknown[]).includes(k)} /> {label}</label>
          ))}
        </fieldset>
        <Field label="Order" hint="Lowest first"><input name="sortOrder" inputMode="numeric" defaultValue={p?.sortOrder ?? 0} className={`${inputCls} w-20`} /></Field>
      </div>
    </ActionForm>
  )

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">Plans</h1>
      <p className="text-sm text-slate-600">What you sell to store owners. A store can have a negotiated price on top (set on the store's page). Switching a plan off hides it from new stores; existing stores keep it. Changing a price changes what existing stores on that plan are billed from their next invoice. To make a tailor-made plan for one client, add a plan and untick “Show on pricing page”: visitors never see it, and you give it to the store from its page. The limits, tagline, included services and “Most popular” are shown on the public pricing page; the staff limit and POS lite are enforced by the platform (a store's page can override both); the products and orders limits are not enforced yet, so treat those as promises you keep by hand.</p>
      <p className="text-sm"><a href="/csmi/offers" className="underline font-medium">Offers and discount codes</a></p>
      {manage && (
        <Card title="Recommended: Basic and Pro" hint="Two plans built for Pakistani shops. Basic has everything needed to sell with cash on delivery; Pro adds the tools that pay for themselves. You can change any price or feature afterwards.">
          <div className="grid gap-4 text-sm md:grid-cols-2">
            {RECOMMENDED_PLANS.map((p) => (
              <div key={p.name} className={`rounded-lg border p-4 ${p.limits.popular ? 'border-violet-300 bg-violet-50/50' : 'border-slate-200'}`}>
                <p className="font-semibold">{p.name} · Rs. {p.monthlyPrice.toLocaleString('en-PK')}/month <span className="font-normal text-slate-500">or Rs. {p.yearlyPrice.toLocaleString('en-PK')}/year</span></p>
                <p className="mt-1 text-slate-600">{p.limits.tagline}</p>
                <p className="mt-2 text-slate-700">{p.limits.products ? `Up to ${p.limits.products} products` : 'Unlimited products'} · {p.limits.staff} staff login{p.limits.staff === 1 ? '' : 's'} · videos up to {p.limits.videoMb} MB</p>
                <p className="mt-2 text-slate-700">{p.features.length ? `All ${p.features.length} Pro features.` : `The ${INCLUDED_IN_ALL.length} essentials every plan has, no Pro features.`}</p>
              </div>
            ))}
          </div>
          <ActionForm action={installPlansAction} className="mt-4 flex flex-wrap items-center gap-4">
            <button className={primaryBtn}>Set up Basic and Pro</button>
            <Check name="refresh" label="If they already exist, update their features and limits to the recommendation (prices are kept)" />
          </ActionForm>
          <p className="mt-3 text-xs text-slate-500">Stores on a free trial get every Pro feature until the trial ends; then their plan decides. Existing plans with other names are not touched: switch them off or hide them when you are ready.</p>
        </Card>
      )}
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
