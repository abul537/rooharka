import { db } from '@/lib/db'
import { requirePlatform } from '@/lib/csmi/guard'
import { canPlatform } from '@/lib/csmi/rules'
import { loadPlatform } from '@/lib/csmi/data'
import { COST_CATEGORIES } from '@/lib/csmi/forms'
import { formatPrice } from '@/lib/format'
import ActionForm from '@/components/admin/ActionForm'
import { Card, Check, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { Stat } from '@/components/csmi/Pills'
import { deleteCostAction, saveCostAction } from '../actions'

export const dynamic = 'force-dynamic'

export default async function CostsPage() {
  const user = await requirePlatform()
  const manage = canPlatform(user.role, 'csmi.manage')
  const [p, costs, stores] = await Promise.all([
    loadPlatform(30),
    db.platformCost.findMany({ orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }], include: { store: { select: { name: true } } } }),
    db.store.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ])

  const form = (c?: (typeof costs)[number]) => (
    <ActionForm action={saveCostAction} className="grid sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1.2fr_auto_auto] gap-3 items-end">
      {c && <input type="hidden" name="costId" value={c.id} />}
      <Field label="What is it?"><input name="name" defaultValue={c?.name ?? ''} required maxLength={60} placeholder="Neon database" className={inputCls} /></Field>
      <Field label="Type">
        <select name="category" defaultValue={c?.category ?? 'other'} className={inputCls}>{COST_CATEGORIES.map((k) => <option key={k} value={k}>{k}</option>)}</select>
      </Field>
      <Field label="Per month (Rs.)"><input name="monthlyAmount" inputMode="decimal" defaultValue={c ? c.monthlyAmount.toNumber() : ''} required className={inputCls} /></Field>
      <Field label="Charged to">
        <select name="storeId" defaultValue={c?.storeId ?? ''} className={inputCls}>
          <option value="">Shared by all live stores</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name} only</option>)}
        </select>
      </Field>
      <Check name="isActive" label="Counting" defaultChecked={c?.isActive ?? true} />
      <button className={primaryBtn}>{c ? 'Save' : 'Add cost'}</button>
    </ActionForm>
  )

  return (
    <div className="max-w-6xl space-y-6">
      <h1 className="text-2xl font-bold">Costs and profit</h1>
      <p className="text-sm text-slate-600">Add what it costs you to run the platform each month: hosting, database, domains, support time. Profit = recurring revenue minus these costs. A cost for one store counts against that store; a shared cost is split equally across stores that are still live.</p>
      <section className="grid sm:grid-cols-3 gap-4">
        <Stat title="Recurring revenue" value={formatPrice(p.revenue.mrr)} sub="per month" />
        <Stat title="Running costs" value={formatPrice(p.costs.total)} sub={`${formatPrice(p.costs.shared)} shared`} />
        <Stat title="Profit" value={formatPrice(p.profit.profit)} tone={p.profit.profit < 0 ? 'bad' : 'good'} sub={p.profit.marginPct === null ? undefined : `${p.profit.marginPct}% margin`} />
      </section>
      {p.costs.unallocated > 0 && <p role="alert" className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">{formatPrice(p.costs.unallocated)} of shared costs have no live store to carry them, so they show in the total but on no store.</p>}
      {manage && <Card title="Add a cost">{form()}</Card>}
      <Card title="Your costs">
        {costs.length === 0 ? <p className="text-sm text-slate-500">No costs added yet, so profit currently equals revenue. Add your hosting and database costs for a true profit figure.</p> : (
          <div className="space-y-5 divide-y divide-slate-100">
            {costs.map((c) => (
              <div key={c.id} className="pt-4 first:pt-0">
                {manage ? (
                  <>
                    {form(c)}
                    <ActionForm action={deleteCostAction} confirm={`Delete “${c.name}”?`} className="mt-1">
                      <input type="hidden" name="costId" value={c.id} />
                      <button className="text-xs text-red-700 underline">Delete this cost</button>
                    </ActionForm>
                  </>
                ) : <p className="text-sm">{c.name}: {formatPrice(c.monthlyAmount.toNumber())}/month · {c.store ? `${c.store.name} only` : 'shared'}{c.isActive ? '' : ' (not counting)'}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
