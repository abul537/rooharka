import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/guard'
import { effectiveInvoiceStatus, intervalOf, periodPrice } from '@/lib/csmi/rules'
import { formatPrice } from '@/lib/format'
import { formatPkt } from '@/lib/admin/dates'
import { getPlatformSettings } from '@/lib/signup/store'
import { Pill } from '@/components/csmi/Pills'

export const dynamic = 'force-dynamic'
const day = (d: Date) => formatPkt(d).split(',').slice(0, 2).join(',')

/** Read-only: the store owner's plan, trial and invoices, and how to pay. Only people who may edit settings see it. */
export default async function BillingPage() {
  const admin = await requireAdmin('settings.edit')
  const now = new Date()
  const [sub, invoices, s] = await Promise.all([
    db.subscription.findUnique({ where: { storeId: admin.storeId }, include: { plan: true } }),
    db.invoice.findMany({ where: { storeId: admin.storeId }, orderBy: { createdAt: 'desc' }, take: 24 }),
    getPlatformSettings(),
  ])
  const interval = sub ? intervalOf(sub.currentPeriodStart, sub.currentPeriodEnd) : 'MONTHLY'
  const price = sub ? periodPrice({ monthlyPrice: sub.plan.monthlyPrice.toNumber(), yearlyPrice: sub.plan.yearlyPrice?.toNumber() ?? null }, interval, sub.priceOverride?.toNumber() ?? null) : null
  const trialLeft = sub?.status === 'TRIALING' && sub.trialEndsAt ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / 86_400_000)) : null
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
