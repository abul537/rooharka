import { db } from '@/lib/db'
import { requirePlatform } from '@/lib/csmi/guard'
import { canPlatform } from '@/lib/csmi/rules'
import ActionForm from '@/components/admin/ActionForm'
import { Card, Check, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { savePlanAction } from '../actions'

export const dynamic = 'force-dynamic'

export default async function PlansPage() {
  const user = await requirePlatform()
  const manage = canPlatform(user.role, 'csmi.manage')
  const plans = await db.plan.findMany({ orderBy: { monthlyPrice: 'asc' }, include: { _count: { select: { subscriptions: true } } } })

  const form = (p?: (typeof plans)[number]) => (
    <ActionForm action={savePlanAction} className="grid sm:grid-cols-[1.2fr_1fr_1fr_auto_auto] gap-3 items-end">
      {p && <input type="hidden" name="planId" value={p.id} />}
      <Field label="Name"><input name="name" defaultValue={p?.name ?? ''} required maxLength={40} className={inputCls} /></Field>
      <Field label="Monthly price (Rs.)"><input name="monthlyPrice" inputMode="decimal" defaultValue={p ? p.monthlyPrice.toNumber() : ''} required className={inputCls} /></Field>
      <Field label="Yearly price (optional)"><input name="yearlyPrice" inputMode="decimal" defaultValue={p?.yearlyPrice ? p.yearlyPrice.toNumber() : ''} className={inputCls} /></Field>
      <Check name="isActive" label="Offered" defaultChecked={p?.isActive ?? true} />
      <button className={primaryBtn}>{p ? 'Save' : 'Add plan'}</button>
    </ActionForm>
  )

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">Plans</h1>
      <p className="text-sm text-slate-600">What you sell to store owners. A store can have a negotiated price on top (set on the store's page). Switching a plan off hides it from new stores; existing stores keep it. Changing a price changes what existing stores on that plan are billed from their next invoice.</p>
      {manage && <Card title="Add a plan">{form()}</Card>}
      <Card title="Your plans">
        {plans.length === 0 ? <p className="text-sm text-slate-500">No plans yet. Add one above, then give stores a plan from their page.</p> : (
          <div className="space-y-5 divide-y divide-slate-100">
            {plans.map((p) => (
              <div key={p.id} className="pt-4 first:pt-0">
                <p className="text-xs text-slate-500 mb-2">{p._count.subscriptions} store{p._count.subscriptions === 1 ? '' : 's'} on this plan</p>
                {manage ? form(p) : <p className="text-sm">{p.name}: Rs. {p.monthlyPrice.toNumber().toLocaleString('en-PK')}/month{p.isActive ? '' : ' (switched off)'}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
