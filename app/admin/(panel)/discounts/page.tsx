import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/guard'
import { can } from '@/lib/auth/permissions'
import { DISCOUNT_KINDS, KIND_LABEL, MAX_PERCENT, describeDiscount, discountProblem } from '@/lib/discounts'
import { pktDay } from '@/lib/admin/insights'
import ActionForm from '@/components/admin/ActionForm'
import { Card, Check, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { createDiscountAction, discountAction } from './actions'

export const dynamic = 'force-dynamic'

/** DISCOUNT CODES of this store: what each gives, how often it was used, and a form to make a new one. */
export default async function DiscountsPage() {
  const admin = await requireAdmin('orders.view')
  const rows = await db.discount.findMany({ where: { storeId: admin.storeId }, orderBy: { createdAt: 'desc' } })
  const editable = can(admin.role, 'settings.edit')
  const now = new Date()
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Discount codes</h1>
        <p className="mt-1 text-sm text-slate-600">A code your customers type at checkout, such as EID10. Share it in your ads, on WhatsApp or in a parcel. The discount is shown to the customer before they order and written on the order.</p>
      </div>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {rows.length === 0 && <p className="p-6 text-sm text-slate-500">No codes yet.</p>}
        {rows.map((d) => {
          const rule = { ...d, value: d.value.toNumber(), minSubtotal: d.minSubtotal.toNumber() }
          const state = !d.isActive ? 'Off' : discountProblem(rule, Number.MAX_SAFE_INTEGER, now) ? (d.endsAt && now > d.endsAt ? 'Expired' : d.startsAt && now < d.startsAt ? 'Not started' : 'Used up') : 'Working'
          return (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-mono text-lg font-semibold">{d.code} <span className={`ml-2 rounded-full px-2.5 py-0.5 align-middle font-sans text-xs font-medium ${state === 'Working' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{state}</span></p>
                <p className="text-sm text-slate-600">
                  {describeDiscount(rule)}{rule.minSubtotal > 0 && ` on orders from Rs. ${rule.minSubtotal.toLocaleString('en-PK')}`}
                  {' · '}used {d.usedCount}{d.maxUses !== null ? ` of ${d.maxUses}` : ''} time{d.usedCount === 1 && d.maxUses === null ? '' : 's'}
                  {d.oncePerCustomer && ' · once per customer'}
                  {(d.startsAt || d.endsAt) && ` · ${d.startsAt ? `from ${pktDay(d.startsAt)}` : ''}${d.startsAt && d.endsAt ? ' ' : ''}${d.endsAt ? `until ${pktDay(d.endsAt)}` : ''}`}
                </p>
              </div>
              {editable && (
                <div className="flex items-center gap-3">
                  <ActionForm action={discountAction}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="what" value="toggle" /><button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">{d.isActive ? 'Switch off' : 'Switch on'}</button></ActionForm>
                  <ActionForm action={discountAction} confirm={`Delete the code ${d.code}? Orders that used it keep their discount.`}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="what" value="delete" /><button className="text-sm text-red-700 underline">Delete</button></ActionForm>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {editable && (
        <Card title="New code" hint="A code cannot make an order free: a percentage is at most 90, and a rupees-off code needs a minimum order at least as large as the discount.">
          <ActionForm action={createDiscountAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Code" hint="3 to 20 letters and digits."><input name="code" required maxLength={24} placeholder="EID10" className={`${inputCls} font-mono uppercase`} /></Field>
              <Field label="It gives"><select name="kind" defaultValue="PERCENT" className={inputCls}>{DISCOUNT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></Field>
              <Field label="How much" hint={`Percent (1 to ${MAX_PERCENT}) or rupees. Leave empty for free delivery.`}><input name="value" inputMode="numeric" maxLength={7} placeholder="10" className={inputCls} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Minimum order (Rs.)" hint="Empty = any order."><input name="minSubtotal" inputMode="numeric" maxLength={7} className={inputCls} /></Field>
              <Field label="Total uses" hint="Empty = no limit."><input name="maxUses" inputMode="numeric" maxLength={7} className={inputCls} /></Field>
              <Field label="First day" hint="Empty = now."><input name="startsAt" type="date" className={inputCls} /></Field>
              <Field label="Last day" hint="Empty = no end."><input name="endsAt" type="date" className={inputCls} /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Check name="oncePerCustomer" label="Each customer (phone number) may use it once" />
              <Check name="isActive" label="Switch it on now" defaultChecked />
            </div>
            <button className={primaryBtn}>Create code</button>
          </ActionForm>
        </Card>
      )}
    </div>
  )
}
