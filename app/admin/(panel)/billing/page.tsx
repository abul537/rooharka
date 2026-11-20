import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/guard'
import { effectiveInvoiceStatus, intervalOf, periodPrice } from '@/lib/csmi/rules'
import { formatPrice } from '@/lib/format'
import { formatPkt } from '@/lib/admin/dates'
import { getPlatformSettings } from '@/lib/signup/store'
import { Pill } from '@/components/csmi/Pills'
import ActionForm from '@/components/admin/ActionForm'
import CompareTable from '@/components/plans/CompareTable'
import { getPublicPlans } from '@/lib/signup/public-plans'
import { loadPlanAccess } from '@/lib/plans/access'
import { PRO_FEATURES, paysForItself } from '@/lib/plans/catalog'
import { requestPlanAction } from './actions'

export const dynamic = 'force-dynamic'
const day = (d: Date) => formatPkt(d).split(',').slice(0, 2).join(',')

/** Read-only: the store owner's plan, trial and invoices, and how to pay. Only people who may edit settings see it. */
export default async function BillingPage() {
  const admin = await requireAdmin('settings.edit')
  const now = new Date()
  const [sub, invoices, s, plans, access] = await Promise.all([
    db.subscription.findUnique({ where: { storeId: admin.storeId }, include: { plan: true } }),
    db.invoice.findMany({ where: { storeId: admin.storeId }, orderBy: { createdAt: 'desc' }, take: 24 }),
    getPlatformSettings(),
    getPublicPlans(),
    loadPlanAccess(admin.storeId),
  ])
  // The plans this store can switch to (public ones), plus its own plan when that one is private (tailor-made).
  const shown = sub && !plans.some((p) => p.id === sub.planId) ? [...plans, { id: sub.planId, name: sub.plan.name, monthly: sub.plan.monthlyPrice.toNumber(), yearly: sub.plan.yearlyPrice?.toNumber() ?? null, limits: sub.plan.limits, features: sub.plan.features }] : plans
  const basic = plans.find((p) => p.name === 'Basic'), pro = plans.find((p) => p.name === 'Pro')
  const saving = basic && pro && sub?.planId !== pro.id ? paysForItself(basic.monthly, pro.monthly) : null
  const onNow = [...access.features.on]
  const interval = sub ? intervalOf(sub.currentPeriodStart, sub.currentPeriodEnd) : 'MONTHLY'
  const price = sub ? periodPrice({ monthlyPrice: sub.plan.monthlyPrice.toNumber(), yearlyPrice: sub.plan.yearlyPrice?.toNumber() ?? null }, interval, sub.priceOverride?.toNumber() ?? null) : null
  const trialLeft = sub?.status === 'TRIALING' && sub.trialEndsAt ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / 86_400_000)) : null
  const canSwitch = plans.length > 0 && sub?.status !== 'CANCELLED'
  const wa = s.supportWhatsapp ? `https://wa.me/${s.supportWhatsapp.replace(/\D/g, '')}` : null

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">Plan and billing</h1>

      <section className="rounded-xl bg-white border border-slate-200 p-5">
        {!sub ? <p className="text-sm text-slate-600">No plan is set up for this store yet. Contact us and we will set it up.</p> : (
          <div className="grid gap-4 sm:grid-cols-3 text-sm">
            <div><p className="text-slate-500">Plan</p><p className="text-lg font-semibold">{sub.plan.name}</p></div>
            <div><p className="text-slate-500">Price</p><p className="text-lg font-semibold">{price === null ? '-' : `${formatPrice(price)} / ${interval === 'YEARLY' ? 'year' : 'month'}`}</p></div>
            <div><p className="text-slate-500">Status</p><p className="mt-1"><Pill status={sub.status} /></p></div>
            <p className="sm:col-span-3 text-slate-600">
              {trialLeft !== null ? `Your free trial ends on ${day(sub.trialEndsAt!)} (${trialLeft} day${trialLeft === 1 ? '' : 's'} left). After that we send an invoice.` : `Current period: ${day(sub.currentPeriodStart)} to ${day(sub.currentPeriodEnd)}.`}
            </p>
          </div>
        )}
      </section>

      <section id="plans" className="scroll-mt-6 rounded-xl bg-white border border-slate-200 p-5">
        <h2 className="font-semibold">Plans</h2>
        <p className="mt-1 mb-4 text-sm text-slate-600">
          {access.trial ? 'During your free trial every Pro feature is switched on, so you can see what each one does. When the trial ends, your plan decides.' : onNow.length ? `Pro features you have now: ${onNow.map((k) => PRO_FEATURES[k].short).join(', ')}.` : 'Your plan has the essentials. Pro adds the tools below that protect and grow your sales.'}
        </p>
        <CompareTable plans={shown.map((p) => ({ ...p, current: p.id === sub?.planId }))} />
        {saving && <p className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-950"><strong>Why Pro pays for itself.</strong> {saving}</p>}
        {canSwitch && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {plans.filter((p) => p.id !== sub?.planId).map((p) => (
              <ActionForm key={p.id} action={requestPlanAction} confirm={`Ask to move your shop to ${p.name}?`} className="rounded-lg border border-slate-200 p-4">
                <input type="hidden" name="planId" value={p.id} />
                <p className="font-semibold">{p.name}: {formatPrice(p.monthly)} a month{p.yearly ? ` or ${formatPrice(p.yearly)} a year` : ''}</p>
                {p.yearly && (
                  <div className="mt-2 flex gap-4 text-sm">
                    <label className="flex items-center gap-1.5"><input type="radio" name="interval" value="monthly" defaultChecked /> Monthly</label>
                    <label className="flex items-center gap-1.5"><input type="radio" name="interval" value="yearly" /> Yearly</label>
                  </div>
                )}
                <button className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Switch to {p.name}</button>
              </ActionForm>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">Your request goes to us under Help; we confirm it, usually the same day. Moving to a smaller plan never deletes anything: features beyond the plan are simply switched off, and come back if you move up again.</p>
      </section>

      <section className="rounded-xl bg-white border border-slate-200 p-5">
        <h2 className="font-semibold mb-3">Invoices</h2>
        {invoices.length === 0 ? <p className="text-sm text-slate-500">No invoices yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b border-slate-200"><tr><th className="py-2 pr-3">Invoice</th><th className="py-2 pr-3">Period</th><th className="py-2 pr-3">Due</th><th className="py-2 pr-3 text-right">Amount</th><th className="py-2">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((i) => (
                <tr key={i.id}><td className="py-2 pr-3 font-medium whitespace-nowrap">{i.number}</td><td className="py-2 pr-3 whitespace-nowrap">{day(i.periodStart)} to {day(i.periodEnd)}</td><td className="py-2 pr-3 whitespace-nowrap">{day(i.dueDate)}</td><td className="py-2 pr-3 text-right">{formatPrice(i.total.toNumber())}</td><td className="py-2"><Pill status={effectiveInvoiceStatus(i.status, i.dueDate, now)} /></td></tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      <section className="rounded-xl bg-white border border-slate-200 p-5">
        <h2 className="font-semibold mb-2">How to pay</h2>
        {s.paymentInstructions ? <p className="text-sm whitespace-pre-line">{s.paymentInstructions}</p> : <p className="text-sm text-slate-600">Contact us for payment details.</p>}
        <p className="text-sm text-slate-600 mt-3">After paying, tell us the invoice number and your payment reference{s.supportEmail || wa ? ': ' : '.'}{s.supportEmail && <a className="underline" href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a>}{s.supportEmail && wa ? ' or ' : ''}{wa && <a className="underline" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a>}. We mark it paid here.</p>
      </section>
    </div>
  )
}
