import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/guard'
import { can } from '@/lib/auth/permissions'
import { formatPkt } from '@/lib/admin/dates'
import { whatsappNumber } from '@/lib/admin/order-tracking'
import { itemsParam } from '@/lib/cart'
import { LEAD_KEEP_DAYS, LEAD_WAIT_MINUTES, leadMessage, readLeadLines } from '@/lib/leads'
import ActionForm from '@/components/admin/ActionForm'
import { leadAction } from './actions'

export const dynamic = 'force-dynamic'
const rs = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`

/**
 * UNFINISHED CHECKOUTS: customers who entered their name and phone, went on to payment, and did not order.
 * A short WhatsApp message from the owner often brings them back. Only this store's rows.
 */
export default async function AbandonedPage() {
  const admin = await requireAdmin('orders.view')
  const now = Date.now()
  const [rows, recovered, store, domain] = await Promise.all([
    db.checkoutLead.findMany({ where: { storeId: admin.storeId, recoveredAt: null, updatedAt: { lt: new Date(now - LEAD_WAIT_MINUTES * 60_000), gt: new Date(now - LEAD_KEEP_DAYS * 86_400_000) } }, orderBy: { updatedAt: 'desc' }, take: 100 }),
    db.checkoutLead.count({ where: { storeId: admin.storeId, recoveredAt: { gt: new Date(now - LEAD_KEEP_DAYS * 86_400_000) }, contactedAt: { not: null } } }),
    db.storeSettings.findUnique({ where: { storeId: admin.storeId }, select: { displayName: true } }),
    db.storeDomain.findFirst({ where: { storeId: admin.storeId, verifiedAt: { not: null } }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], select: { host: true } }),
  ])
  const editable = can(admin.role, 'orders.update')
  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Unfinished checkouts</h1>
        <p className="mt-1 text-sm text-slate-600">Customers who entered their name and phone at checkout but did not place the order (after {LEAD_WAIT_MINUTES} minutes). Send a friendly message from your own WhatsApp; many only needed a question answered. Kept for {LEAD_KEEP_DAYS} days.{recovered > 0 && ` ${recovered} customer${recovered === 1 ? '' : 's'} you contacted went on to order.`}</p>
      </div>
      {rows.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Nobody is waiting. Every checkout that was started was either finished or is still fresh.</p>}
      <ul className="space-y-3">
        {rows.map((r) => {
          const lines = readLeadLines(r.items)
          const url = domain && lines.length ? `https://${domain.host}/checkout?items=${encodeURIComponent(itemsParam(lines))}` : null
          const wa = whatsappNumber(r.phone)
          const text = leadMessage({ name: r.name, store: store?.displayName ?? 'our shop', first: lines[0]?.name ?? 'something', more: Math.max(0, lines.length - 1), url })
          return (
            <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{r.name} <a href={`tel:${r.phone}`} className="ml-1 font-normal text-slate-600 underline">{r.phone}</a>{r.contactedAt && <span className="ml-2 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-700">Contacted</span>}</p>
                  <p className="text-sm text-slate-500">Left {formatPkt(r.updatedAt)} · {rs(r.subtotal.toNumber())}</p>
                  <ul className="mt-2 text-sm text-slate-700">{lines.map((l) => <li key={l.variantId}>{l.name}{l.label && ` (${l.label})`} × {l.quantity}</li>)}</ul>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {wa && <a href={`https://wa.me/${wa}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50">Message on WhatsApp</a>}
                  {editable && !r.contactedAt && <ActionForm action={leadAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="what" value="contacted" /><button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Mark contacted</button></ActionForm>}
                  {editable && <ActionForm action={leadAction} confirm="Remove this unfinished checkout?"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="what" value="remove" /><button className="text-sm text-red-700 underline">Remove</button></ActionForm>}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
