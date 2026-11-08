import { db } from '@/lib/db'
import { requirePlatform } from '@/lib/csmi/guard'
import { canPlatform } from '@/lib/csmi/rules'
import { formatPkt } from '@/lib/admin/dates'
import { describeOffer, offerProblem } from '@/lib/offers/rules'
import ActionForm from '@/components/admin/ActionForm'
import { Card, Check, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { saveOfferAction } from '../actions'

export const dynamic = 'force-dynamic'

const dateInput = (d: Date | null) => (d ? new Date(d.getTime() + 5 * 3_600_000).toISOString().slice(0, 10) : '') // Pakistan day

export default async function OffersPage() {
  const user = await requirePlatform()
  const manage = canPlatform(user.role, 'csmi.manage')
  const [offers, plans] = await Promise.all([
    db.offer.findMany({ orderBy: { createdAt: 'desc' } }),
    db.plan.findMany({ orderBy: { monthlyPrice: 'asc' }, select: { id: true, name: true } }),
  ])
  const planName = new Map<string, string>(plans.map((p: { id: string; name: string }) => [p.id, p.name]))

  const form = (o?: (typeof offers)[number]) => (
    <ActionForm action={saveOfferAction} className="grid sm:grid-cols-4 gap-3 items-end">
      {o && <input type="hidden" name="offerId" value={o.id} />}
      <Field label="Code" hint={o ? 'Cannot change' : 'Letters, digits, dashes'}><input name="code" defaultValue={o?.code ?? ''} readOnly={!!o} required maxLength={24} className={`${inputCls} uppercase`} /></Field>
      <div className="sm:col-span-2"><Field label="Title (what the store owner sees)"><input name="title" defaultValue={o?.title ?? ''} required maxLength={80} className={inputCls} /></Field></div>
      <Check name="isActive" label="Active" defaultChecked={o?.isActive ?? true} />
      <Field label="Percent off the plan fee"><input name="percentOff" inputMode="numeric" defaultValue={o?.percentOff ?? ''} required className={inputCls} /></Field>
      <Field label="For how many invoices"><input name="periods" inputMode="numeric" defaultValue={o?.periods ?? 1} required className={inputCls} /></Field>
      <Field label="Plan"><select name="planId" defaultValue={o?.planId ?? ''} className={inputCls}><option value="">Any plan</option>{plans.map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="Max uses" hint="Empty = unlimited"><input name="maxUses" inputMode="numeric" defaultValue={o?.maxUses ?? ''} className={inputCls} /></Field>
      <Field label="Starts (optional)"><input name="startsAt" type="date" defaultValue={dateInput(o?.startsAt ?? null)} className={inputCls} /></Field>
      <Field label="Ends (optional)"><input name="endsAt" type="date" defaultValue={dateInput(o?.endsAt ?? null)} className={inputCls} /></Field>
      <button className={`${primaryBtn} sm:col-start-4`}>{o ? 'Save' : 'Create offer'}</button>
    </ActionForm>
  )

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">Offers</h1>
      <p className="text-sm text-slate-600">
        A code worth a percentage off the <strong>plan fee</strong> (add-on fees are not discounted) for the first few invoices after the free trial. Share the link <code>/signup?offer=CODE</code> and the code is filled in for the visitor.
        Turning an offer off stops new sign-ups using it; stores that already have it keep the discount they were promised. The discount shows as its own line on the invoice.
      </p>
      {manage && <Card title="Launch an offer">{form()}</Card>}
      <Card title="Your offers">
        {offers.length === 0 ? <p className="text-sm text-slate-500">No offers yet.</p> : (
          <div className="space-y-5 divide-y divide-slate-100">
            {offers.map((o: (typeof offers)[number]) => {
              const live = !offerProblem(o, { planId: o.planId ?? '' }) // plan match is irrelevant here, so pass its own plan
              return (
                <div key={o.id} className="pt-4 first:pt-0">
                  <p className="text-sm mb-2"><strong className="font-mono">{o.code}</strong> · {describeOffer(o)} · {o.planId ? planName.get(o.planId) ?? 'plan removed' : 'any plan'} · used {o.usedCount}{o.maxUses ? ` of ${o.maxUses}` : ''}
                    {' '}<span className={live ? 'text-emerald-700' : 'text-slate-500'}>{live ? 'live now' : 'not live'}</span>
                    {o.endsAt ? ` · ends ${formatPkt(o.endsAt)}` : ''}</p>
                  {manage ? form(o) : null}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
