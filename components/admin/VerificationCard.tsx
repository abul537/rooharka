import ActionForm from '@/components/admin/ActionForm'
import { verificationAction } from '@/app/admin/(panel)/orders/[id]/actions'
import { LABEL_TEXT, VERDICT_TEXT, confirmMessage, type Reason, type RiskLabel, type Verdict } from '@/lib/fraud/rules'
import { whatsappNumber } from '@/lib/admin/order-tracking'
import { formatPkt } from '@/lib/admin/dates'

const TONE: Record<Verdict, string> = { CLEAR: 'border-emerald-200 bg-emerald-50 text-emerald-900', REVIEW: 'border-amber-300 bg-amber-50 text-amber-900', BLOCK: 'border-red-300 bg-red-50 text-red-900' }
const PILL: Record<Verdict, string> = { CLEAR: 'bg-emerald-100 text-emerald-800', REVIEW: 'bg-amber-100 text-amber-900', BLOCK: 'bg-red-100 text-red-800' }

/** The small badge used in lists. Nothing is drawn for orders that are not checked (prepaid, counter sales, older orders). */
export function VerificationBadge({ status }: { status: string | null | undefined }) {
  const v = status === 'CLEAR' || status === 'REVIEW' || status === 'BLOCK' ? (status as Verdict) : null
  return v ? <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${PILL[v]}`}><span aria-hidden>{VERDICT_TEXT[v].mark} </span>{VERDICT_TEXT[v].label}</span> : null
}

const reasonsOf = (raw: unknown): Reason[] => {
  const list = raw && typeof raw === 'object' ? (raw as { reasons?: unknown }).reasons : null
  return Array.isArray(list) ? list.filter((r): r is Reason => !!r && typeof r === 'object' && typeof (r as Reason).text === 'string').slice(0, 12) : []
}

/**
 * THE FAKE-ORDER CHECK on the order page: one decision (clear, review or blocked), the reasons in plain words,
 * and what the owner can do about it. The system has already acted (a held order gets no courier); the owner
 * only steps in to overrule it.
 */
export default function VerificationCard({ order, shop, canUpdate, open }: {
  order: { id: string; number: string; customerName: string; customerPhone: string; cityName: string; total: number; status: string; verificationStatus: string | null; fraudRiskLabel: string | null; riskScore: number | null; recommendedAction: string | null; verification: unknown; verifiedAt: Date | null; verificationOverrideAt: Date | null }
  shop: string; canUpdate: boolean
  /** The order can still change (not shipped, delivered, cancelled or returned). */
  open: boolean
}) {
  const v = order.verificationStatus as Verdict | null
  if (!v || !VERDICT_TEXT[v]) return null
  const reasons = reasonsOf(order.verification)
  const held = v !== 'CLEAR'
  const wa = whatsappNumber(order.customerPhone)
  const ask = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(confirmMessage({ name: order.customerName, number: order.number, total: order.total, store: shop, city: order.cityName }))}` : null
  return (
    <section className={`rounded-xl border p-5 ${TONE[v]}`} aria-label="Fake-order check">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold"><span aria-hidden>{VERDICT_TEXT[v].mark} </span>Fake-order check: {VERDICT_TEXT[v].label}</h2>
        {order.fraudRiskLabel && <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-medium">Buyer: {LABEL_TEXT[order.fraudRiskLabel as RiskLabel] ?? order.fraudRiskLabel}</span>}
      </div>
      <p className="mt-1 text-sm">{order.verificationOverrideAt ? `You approved this order yourself on ${formatPkt(order.verificationOverrideAt)}. What the check found is kept below.` : VERDICT_TEXT[v].about}</p>
      {reasons.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {reasons.map((r, i) => <li key={i} className="flex gap-2"><span aria-hidden>{r.level === 'good' ? '✓' : r.level === 'block' ? '✕' : '!'}</span><span>{r.text}</span></li>)}
        </ul>
      )}
      {order.riskScore !== null && <p className="mt-3 text-xs">Internet connection risk score: {order.riskScore} out of 100{order.recommendedAction ? ` (suggested: ${order.recommendedAction})` : ''}.</p>}
      {canUpdate && open && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {held && (
            <ActionForm action={verificationAction} confirm={v === 'BLOCK' ? `Approve order #${order.number} although it was blocked? Only do this if you have spoken to the buyer.` : undefined}>
              <input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="decision" value="approve" />
              <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">I checked it: approve</button>
            </ActionForm>
          )}
          {held && ask && <a href={ask} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-emerald-600 bg-white px-4 py-2 text-sm font-medium text-emerald-800">Ask the buyer to confirm on WhatsApp</a>}
          <ActionForm action={verificationAction}>
            <input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="decision" value="recheck" />
            <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800">Check again</button>
          </ActionForm>
        </div>
      )}
      {held && <p className="mt-3 text-xs">If it is fake, cancel the order below: the stock goes back on the shelf. You can also block the number on the customer’s page.</p>}
      {order.verifiedAt && <p className="mt-2 text-xs opacity-75">Checked {formatPkt(order.verifiedAt)}. No check can catch every fake order; it stops the obvious ones and tells you where to look.</p>}
    </section>
  )
}
