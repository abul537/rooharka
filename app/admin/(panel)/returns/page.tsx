import Link from 'next/link'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/guard'
import { can } from '@/lib/auth/permissions'
import { formatPkt } from '@/lib/admin/dates'
import { loadExtra } from '@/lib/admin/extra'
import { formatQuantity } from '@/lib/units/registry'
import { REFUND_METHODS, RETURN_LABEL, RETURN_REASONS, isOpen, linesValue, readReturnLines, readReturnPolicy, refundCeiling, type ReturnReason, type ReturnStatus } from '@/lib/returns'
import ActionForm from '@/components/admin/ActionForm'
import { Card, Check, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { returnPolicyAction, returnStepAction } from './actions'

export const dynamic = 'force-dynamic'
const rs = (n: number) => `Rs. ${n.toLocaleString('en-PK')}`
const TONE: Record<ReturnStatus, string> = { REQUESTED: 'bg-amber-100 text-amber-900', APPROVED: 'bg-sky-100 text-sky-900', RECEIVED: 'bg-violet-100 text-violet-900', COMPLETED: 'bg-emerald-100 text-emerald-900', REJECTED: 'bg-slate-200 text-slate-700' }
const small = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium'

/**
 * RETURNS: customers' requests to send items back, and the refunds. Open ones first. Only this store's rows.
 * The refund itself is sent by the owner (JazzCash, bank, cash); this page records it.
 */
export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const admin = await requireAdmin('orders.view')
  const closed = (await searchParams).show === 'closed'
  const [rows, extra] = await Promise.all([
    db.returnRequest.findMany({
      where: { storeId: admin.storeId, status: { in: closed ? ['COMPLETED', 'REJECTED'] : ['REQUESTED', 'APPROVED', 'RECEIVED'] } },
      orderBy: { createdAt: closed ? 'desc' : 'asc' }, take: 100,
      include: { order: { select: { id: true, number: true, customerName: true, customerPhone: true, amountPaid: true, total: true, returns: { where: { status: 'COMPLETED' }, select: { refundAmount: true } } } } },
    }),
    loadExtra(admin.storeId),
  ])
  const policy = readReturnPolicy(extra)
  const editable = can(admin.role, 'orders.update'), canRefund = can(admin.role, 'payments.confirm')

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Returns</h1>
        <p className="mt-1 text-sm text-slate-600">Requests to send items back. Answer the request, mark the items as received when they arrive, then record the refund you sent. The customer sees each step on their tracking page.</p>
      </div>

      <div className="flex gap-2 text-sm">
        <Link href="/admin/returns" className={`${small} ${!closed ? 'border-slate-900 bg-slate-900 text-white' : ''}`}>Open</Link>
        <Link href="/admin/returns?show=closed" className={`${small} ${closed ? 'border-slate-900 bg-slate-900 text-white' : ''}`}>Finished</Link>
      </div>

      {rows.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{closed ? 'No finished returns yet.' : 'No open returns. Nothing to do here.'}</p>}
      <ul className="space-y-4">
        {rows.map((r) => {
          const lines = readReturnLines(r.items), status = r.status as ReturnStatus
          const refunded = r.order.returns.reduce((s, x) => s + (x.refundAmount?.toNumber() ?? 0), 0)
          const ceiling = refundCeiling(r.order.amountPaid.toNumber(), refunded), suggested = Math.min(linesValue(lines), ceiling)
          return (
            <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold"><Link href={`/admin/orders/${r.order.id}`} className="underline">Order #{r.order.number}</Link> · {r.order.customerName}</p>
                  <p className="text-sm text-slate-600">{r.order.customerPhone} · asked {formatPkt(r.createdAt)} · {r.source === 'OWNER' ? 'started by the shop' : 'asked by the customer'}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${TONE[status] ?? ''}`}>{RETURN_LABEL[status] ?? r.status}</span>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {lines.map((l) => <li key={l.itemId} className="flex justify-between gap-3"><span>{l.name} × {formatQuantity(l.quantity, l.unitCode)}</span><span className="text-slate-600">{rs(l.amount)}</span></li>)}
              </ul>
              <p className="mt-2 text-sm"><span className="font-medium">Reason:</span> {RETURN_REASONS[r.reason as ReturnReason] ?? r.reason}{r.note ? `. “${r.note}”` : ''}</p>
              {r.answer && <p className="mt-1 text-sm text-slate-700"><span className="font-medium">Your answer:</span> {r.answer}</p>}
              {status === 'COMPLETED' && <p className="mt-1 text-sm text-emerald-800">{r.refundAmount && r.refundAmount.toNumber() > 0 ? `Refunded ${rs(r.refundAmount.toNumber())}${r.refundMethod ? ` by ${r.refundMethod}` : ''}${r.refundRef ? ` (reference ${r.refundRef})` : ''}` : 'Completed with no refund'}{r.restocked ? ' · items put back in stock' : ''}</p>}

              {editable && status === 'REQUESTED' && (
                <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
                  <ActionForm action={returnStepAction}>
                    <input type="hidden" name="id" value={r.id} /><input type="hidden" name="what" value="approve" />
                    <button className={primaryBtn}>Approve the return</button>
                  </ActionForm>
                  <ActionForm action={returnStepAction} confirm="Refuse this return? The customer will see your reason.">
                    <input type="hidden" name="id" value={r.id} /><input type="hidden" name="what" value="reject" />
                    <input name="answer" required minLength={5} maxLength={250} placeholder="Reason for the customer" aria-label="Reason for the customer" className={`${inputCls} mb-2`} />
                    <button className={small}>Refuse</button>
                  </ActionForm>
                </div>
              )}
              {editable && status === 'APPROVED' && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <ActionForm action={returnStepAction} confirm="Mark these items as received?">
                    <input type="hidden" name="id" value={r.id} /><input type="hidden" name="what" value="received" />
                    <Check name="restock" label="Put the items back in stock" hint="Leave this off for damaged items that cannot be sold again." defaultChecked />
                    <div className="mt-3 flex flex-wrap gap-2"><button className={primaryBtn}>Items received</button></div>
                  </ActionForm>
                  <ActionForm action={returnStepAction} confirm="Cancel this return? The customer will see your reason." className="mt-3">
                    <input type="hidden" name="id" value={r.id} /><input type="hidden" name="what" value="reject" />
                    <div className="flex flex-wrap gap-2"><input name="answer" required minLength={5} maxLength={250} placeholder="Reason, if the items never came" aria-label="Reason for cancelling the return" className={`${inputCls} max-w-xs`} /><button className={small}>Cancel the return</button></div>
                  </ActionForm>
                </div>
              )}
              {status === 'RECEIVED' && (canRefund ? (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="mb-3 text-sm text-slate-600">The customer paid {rs(r.order.amountPaid.toNumber())} for this order{refunded > 0 ? `, of which ${rs(refunded)} was refunded before` : ''}. Send the money yourself, then record it here. At most {rs(ceiling)} can be recorded.</p>
                  <ActionForm action={returnStepAction} confirm="Record this refund? This cannot be changed afterwards.">
                    <input type="hidden" name="id" value={r.id} /><input type="hidden" name="what" value="refund" />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Amount sent back (Rs.)"><input name="amount" required inputMode="decimal" defaultValue={suggested} className={inputCls} /></Field>
                      <Field label="How you sent it"><select name="method" defaultValue="" className={inputCls}><option value="">Choose</option>{REFUND_METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field>
                      <Field label="Reference (optional)"><input name="ref" maxLength={60} className={inputCls} /></Field>
                    </div>
                    <button className={`${primaryBtn} mt-3`}>Record the refund</button>
                  </ActionForm>
                </div>
              ) : <p className="mt-3 text-sm text-slate-500">The refund is recorded by the owner or a manager.</p>)}
            </li>
          )
        })}
      </ul>

      {can(admin.role, 'settings.edit') && (
        <Card title="Return policy" hint="Whether customers can ask for a return themselves, from their order tracking page.">
          <ActionForm action={returnPolicyAction}>
            <div className="space-y-4">
              <Check name="enabled" label="Customers can ask for a return online" hint="Off: only you can start a return, from the order’s page." defaultChecked={policy.enabled} />
              <Field label="For how many days after delivery" hint="Between 1 and 60."><input name="days" type="number" min={1} max={60} required defaultValue={policy.days} className={`${inputCls} max-w-[8rem]`} /></Field>
              <Field label="Your return rules, shown to the customer (optional)" hint="For example: items must be unused and in their box; the customer pays the courier."><textarea name="text" rows={3} maxLength={600} defaultValue={policy.text} className={inputCls} /></Field>
              <button className={primaryBtn}>Save policy</button>
            </div>
          </ActionForm>
        </Card>
      )}
    </div>
  )
}
