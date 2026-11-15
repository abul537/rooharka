/**
 * RETURNS AND REFUNDS: the rules, pure and unit-tested.
 *
 *   REQUESTED  the customer asked (tracking page), the owner has not answered yet
 *   APPROVED   the owner said yes; the customer sends the items back
 *   RECEIVED   the items arrived (and, if the owner chose so, went back on the shelf)
 *   COMPLETED  the refund was sent and recorded (or the owner recorded that no money was due)
 *   REJECTED   the owner said no, with a reason the customer can read
 *
 * The shop only RECORDS the refund: the money itself is sent by the owner (JazzCash, bank, cash), because
 * the platform never holds a shop's money.
 */
import { isMeasured } from '@/lib/units/registry'

export const RETURN_STATUSES = ['REQUESTED', 'APPROVED', 'RECEIVED', 'COMPLETED', 'REJECTED'] as const
export type ReturnStatus = (typeof RETURN_STATUSES)[number]
export const RETURN_LABEL: Record<ReturnStatus, string> = { REQUESTED: 'Waiting for your answer', APPROVED: 'Approved, waiting for the items', RECEIVED: 'Items received, refund to send', COMPLETED: 'Completed', REJECTED: 'Refused' }
/** The same steps in the customer's words (tracking page). */
export const RETURN_CUSTOMER_LABEL: Record<ReturnStatus, string> = { REQUESTED: 'Your return request was received. The shop will answer soon.', APPROVED: 'Your return was approved. Please send the items back as the shop tells you.', RECEIVED: 'The shop received your items. Your refund is being arranged.', COMPLETED: 'Your return is complete.', REJECTED: 'The shop could not accept this return.' }
export const RETURN_REASONS = { DAMAGED: 'Arrived damaged or broken', WRONG_ITEM: 'Wrong item was sent', NOT_AS_DESCRIBED: 'Not as described or shown', SIZE: 'Size or fit is not right', QUALITY: 'Not happy with the quality', CHANGED_MIND: 'Changed my mind', OTHER: 'Another reason' } as const
export type ReturnReason = keyof typeof RETURN_REASONS
export const REFUND_METHODS = ['JazzCash', 'EasyPaisa', 'Bank transfer', 'Cash', 'Other'] as const
const NEXT: Record<ReturnStatus, readonly ReturnStatus[]> = { REQUESTED: ['APPROVED', 'REJECTED'], APPROVED: ['RECEIVED', 'REJECTED'], RECEIVED: ['COMPLETED'], COMPLETED: [], REJECTED: [] }
export const canMove = (from: string, to: ReturnStatus) => (NEXT[from as ReturnStatus] ?? []).includes(to)
export const isOpen = (status: string) => status === 'REQUESTED' || status === 'APPROVED' || status === 'RECEIVED'

/** The shop's return policy (StoreSettings.extra.returns). Off until the owner switches it on. */
export interface ReturnPolicy { enabled: boolean; days: number; text: string }
export const DEFAULT_RETURN_POLICY: ReturnPolicy = { enabled: false, days: 7, text: '' }
const line = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max) : '')
export function readReturnPolicy(extra: unknown): ReturnPolicy {
  const r = (extra && typeof extra === 'object' ? (extra as Record<string, unknown>).returns : null) as Record<string, unknown> | null
  if (!r || typeof r !== 'object') return DEFAULT_RETURN_POLICY
  const days = Number(r.days)
  return { enabled: r.enabled === true, days: Number.isInteger(days) && days >= 1 && days <= 60 ? days : DEFAULT_RETURN_POLICY.days, text: line(r.text, 600) }
}
export function parseReturnPolicy(get: (name: string) => unknown): { ok: true; value: ReturnPolicy } | { ok: false; error: string } {
  const days = Number(String(get('days') ?? '').trim())
  if (!Number.isInteger(days) || days < 1 || days > 60) return { ok: false, error: 'The number of days must be between 1 and 60.' }
  return { ok: true, value: { enabled: get('enabled') === 'on' || get('enabled') === true, days, text: line(get('text'), 600) } }
}

/**
 * May the CUSTOMER ask for a return now? Only for a delivered order, inside the shop's window, with no other
 * return of that order still open. `deliveredAt` null = we do not know when it arrived = no.
 */
export function returnWindow(p: ReturnPolicy, order: { status: string; deliveredAt: Date | null }, hasOpen: boolean, now: Date): { allowed: boolean; daysLeft: number } {
  if (!p.enabled || order.status !== 'DELIVERED' || !order.deliveredAt || hasOpen) return { allowed: false, daysLeft: 0 }
  const left = Math.ceil((order.deliveredAt.getTime() + p.days * 86_400_000 - now.getTime()) / 86_400_000)
  return { allowed: left > 0, daysLeft: Math.max(0, left) }
}

export interface OrderLine { id: string; productId: string | null; variantId: string | null; name: string; variantLabel?: string | null; quantity: number; unitCode: string | null; unitPrice: number; lineTotal: number }
export interface ReturnLine { itemId: string; productId: string | null; variantId: string | null; name: string; quantity: number; unitCode: string | null; amount: number }
/** Reads the lines stored on a return (never trusts their shape). */
export function readReturnLines(raw: unknown): ReturnLine[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((r) => {
    if (!r || typeof r !== 'object') return []
    const o = r as Record<string, unknown>, q = Number(o.quantity), a = Number(o.amount)
    if (typeof o.itemId !== 'string' || !Number.isInteger(q) || q <= 0) return []
    return [{ itemId: o.itemId, productId: typeof o.productId === 'string' ? o.productId : null, variantId: typeof o.variantId === 'string' ? o.variantId : null, name: line(o.name, 160), quantity: q, unitCode: typeof o.unitCode === 'string' ? o.unitCode : null, amount: Number.isFinite(a) && a >= 0 ? a : 0 }]
  })
}
/**
 * Turns what was picked into the lines of a return, against the REAL order lines.
 * `already` = how much of each line earlier (not refused) returns already cover: nothing can come back twice.
 * Products sold by weight or length come back as the whole line. An empty pick = everything still returnable.
 */
export function pickReturnLines(order: readonly OrderLine[], picked: unknown, already: ReadonlyMap<string, number>): { ok: true; lines: ReturnLine[] } | { ok: false; error: string } {
  const want = new Map<string, number>()
  if (Array.isArray(picked)) for (const p of picked.slice(0, 100)) {
    if (!p || typeof p !== 'object') continue
    const id = (p as Record<string, unknown>).id, q = Number((p as Record<string, unknown>).quantity)
    if (typeof id === 'string' && Number.isInteger(q) && q > 0) want.set(id, q)
  }
  const lines: ReturnLine[] = []
  for (const it of order) {
    const left = it.quantity - (already.get(it.id) ?? 0)
    if (left <= 0 || (want.size > 0 && !want.has(it.id))) continue
    const measured = isMeasured(it.unitCode)
    const quantity = want.size === 0 || measured ? left : Math.min(want.get(it.id)!, left)
    if (measured && left !== it.quantity) continue
    // The money for this part of the line, from what the customer really paid for the line.
    const amount = Math.round((it.lineTotal * quantity) / it.quantity * 100) / 100
    lines.push({ itemId: it.id, productId: it.productId, variantId: it.variantId, name: it.variantLabel ? `${it.name} (${it.variantLabel})` : it.name, quantity, unitCode: it.unitCode, amount })
  }
  return lines.length ? { ok: true, lines } : { ok: false, error: 'Choose at least one item that has not been returned already.' }
}
/** How much of each order line the given returns already cover (refused returns do not count). */
export function alreadyReturned(returns: readonly { status: string; items: unknown }[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of returns) if (r.status !== 'REJECTED') for (const l of readReturnLines(r.items)) m.set(l.itemId, (m.get(l.itemId) ?? 0) + l.quantity)
  return m
}
export const linesValue = (lines: readonly ReturnLine[]) => Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100

/** What the customer sends from the tracking page. */
export interface ReturnAsk { code: string; last4: string; reason: ReturnReason; note: string; items: unknown; website: string }
export function parseReturnAsk(body: unknown): { ok: true; value: ReturnAsk } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Please fill in the form.' }
  const b = body as Record<string, unknown>
  const reason = String(b.reason ?? '')
  if (!(reason in RETURN_REASONS)) return { ok: false, error: 'Please choose a reason.' }
  const note = line(b.note, 500)
  if (reason === 'OTHER' && note.length < 5) return { ok: false, error: 'Please tell us the reason in a few words.' }
  return { ok: true, value: { code: line(b.code, 40), last4: String(b.last4 ?? '').replace(/\D/g, '').slice(-4), reason: reason as ReturnReason, note, items: b.items, website: line(b.website, 100) } }
}

/**
 * The most that can still be refunded for an order: never more than the customer really paid, minus what
 * earlier returns of the same order already gave back.
 */
export const refundCeiling = (amountPaid: number, refundedBefore: number) => Math.max(0, Math.round((amountPaid - refundedBefore) * 100) / 100)
export function parseRefund(get: (name: string) => unknown, ceiling: number): { ok: true; value: { amount: number; method: string | null; ref: string | null } } | { ok: false; error: string } {
  const raw = String(get('amount') ?? '').replace(/[,\s]/g, '')
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(raw)) return { ok: false, error: 'Enter the amount you sent back (0 if no money was due).' }
  const amount = Number(raw)
  if (amount > ceiling) return { ok: false, error: `The refund cannot be more than what is left of the customer’s payment (Rs. ${ceiling.toLocaleString('en-PK')}).` }
  const method = String(get('method') ?? '')
  if (amount > 0 && !(REFUND_METHODS as readonly string[]).includes(method)) return { ok: false, error: 'Choose how you sent the money.' }
  return { ok: true, value: { amount, method: amount > 0 ? method : null, ref: line(get('ref'), 60) || null } }
}
