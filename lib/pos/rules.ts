/**
 * POS lite: the rules of a counter sale. Pure (no database), so every rule is unit-tested.
 * The server re-prices everything from the database; the browser only says WHAT was sold and HOW it was paid.
 */
import { normalizePkMobile } from '@/lib/phone'
import { MAX_BASE_QUANTITY, lineTotal, quantityRule, type RuleInput } from '@/lib/units/quantity'

/** Recorded, never processed: the money moves in the shop (cash, card machine, wallet app, bank app). */
export const POS_PAYMENT_METHODS = ['CASH', 'CARD', 'JAZZCASH', 'EASYPAISA', 'BANK_TRANSFER'] as const
export type PosPaymentMethod = (typeof POS_PAYMENT_METHODS)[number]
export const POS_METHOD_LABEL: Record<PosPaymentMethod, string> = { CASH: 'Cash', CARD: 'Card', JAZZCASH: 'JazzCash', EASYPAISA: 'EasyPaisa', BANK_TRANSFER: 'Bank transfer' }

export const MAX_SALE_LINES = 50
/** Most of one COUNTED item in one sale. Measured items (grams, millilitres ...) have their own minimum, step and stock limit. */
export const MAX_LINE_QTY = 999
/** The buying rule at the counter for one product and its current stock (null = not tracked). */
export const posRule = (p: RuleInput, stock: number | null) => quantityRule(p, stock, MAX_LINE_QTY)
/** Stored as the customer's phone for sales with no customer details, so every store has ONE "walk-in" profile. */
export const WALK_IN_PHONE = 'WALK-IN'
export const WALK_IN_NAME = 'Walk-in customer'

export interface SaleRequest {
  items: { variantId: string; quantity: number }[]
  discount: number
  paymentMethod: PosPaymentMethod
  /** Cash handed over by the customer (cash sales only); used to show change. */
  tendered: number | null
  customerName: string | null
  customerPhone: string | null
  idempotencyKey: string
  /** Split payment: parts paid another way (e.g. Rs. 2,000 by card). The rest of the total is paid by `paymentMethod`. */
  split: PaymentPart[]
}

export interface PaymentPart { method: PosPaymentMethod; amount: number }
/** Besides the main way of paying, at most this many other ways in one sale. */
export const MAX_SPLIT_PARTS = 2

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
function money(v: unknown): number | null | undefined {
  // null = empty, undefined = invalid
  const s = typeof v === 'number' ? String(v) : str(v).replace(/,/g, '')
  if (s === '') return null
  return /^\d{1,9}(\.\d{1,2})?$/.test(s) ? Number(s) : undefined
}

/** Checks an untrusted request body. One readable message for the first problem. */
export function parseSale(body: unknown): { ok: true; value: SaleRequest } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const raw = Array.isArray(b.items) ? b.items : []
  if (raw.length === 0) return { ok: false, error: 'Add at least one item to the sale.' }
  if (raw.length > MAX_SALE_LINES) return { ok: false, error: `A sale can have at most ${MAX_SALE_LINES} different items.` }

  const merged = new Map<string, number>() // the same item scanned twice becomes one line
  for (const r of raw) {
    const it = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    const id = str(it.variantId)
    const q = typeof it.quantity === 'number' ? it.quantity : Number(it.quantity)
    // The exact rule (whole units, or steps of a kg / litre / metre) is checked per product by the server.
    if (!id || id.length > 40 || !Number.isInteger(q) || q < 1 || q > MAX_BASE_QUANTITY) return { ok: false, error: 'Each quantity must be a whole number above 0.' }
    merged.set(id, (merged.get(id) ?? 0) + q)
  }
  for (const q of merged.values()) if (q > MAX_BASE_QUANTITY) return { ok: false, error: 'That quantity is too large for one sale.' }

  const discount = money(b.discount)
  if (discount === undefined) return { ok: false, error: 'The discount must be an amount in rupees, like 200.' }

  const paymentMethod = POS_PAYMENT_METHODS.find((m) => m === b.paymentMethod)
  if (!paymentMethod) return { ok: false, error: 'Choose how the customer paid.' }

  let tendered: number | null = null
  if (paymentMethod === 'CASH') {
    const t = money(b.tendered)
    if (t === undefined) return { ok: false, error: 'The cash received must be an amount in rupees.' }
    tendered = t
  }

  // Split payment (optional): each part has its own method (different from the main one) and an amount above zero.
  const rawSplit = Array.isArray(b.split) ? b.split : []
  if (rawSplit.length > MAX_SPLIT_PARTS) return { ok: false, error: `A sale can be split over at most ${MAX_SPLIT_PARTS + 1} ways of paying.` }
  const split: PaymentPart[] = []
  for (const r of rawSplit) {
    const part = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    const m = POS_PAYMENT_METHODS.find((x) => x === part.method)
    const a = money(part.amount)
    if (!m || a === undefined || a === null || a <= 0) return { ok: false, error: 'Each part of a split payment needs a way of paying and an amount above zero.' }
    if (m === paymentMethod || split.some((x) => x.method === m)) return { ok: false, error: 'Each part of a split payment must use a different way of paying.' }
    split.push({ method: m, amount: a })
  }

  const name = str(b.customerName).replace(/\s+/g, ' ')
  if (name.length > 80) return { ok: false, error: 'The customer name must be 80 characters or fewer.' }
  const phoneRaw = str(b.customerPhone)
  let phone: string | null = null
  if (phoneRaw) {
    phone = normalizePkMobile(phoneRaw)
    if (!phone) return { ok: false, error: 'That mobile number does not look right. Use a number like 0300 1234567, or leave it empty.' }
  }

  const key = str(b.idempotencyKey)
  if (key.length < 8 || key.length > 80) return { ok: false, error: 'Your screen is out of date. Please refresh the page and try again.' }

  return { ok: true, value: { items: [...merged].map(([variantId, quantity]) => ({ variantId, quantity })), discount: discount ?? 0, paymentMethod, tendered, customerName: name || null, customerPhone: phone, idempotencyKey: key, split } }
}

export interface SaleTotals { subtotal: number; discount: number; total: number }

/** Totals from the database prices. A discount can never take the total below zero. */
export function saleTotals(lines: { unitPrice: number; quantity: number; unitCode?: string | null }[], discount: number): { ok: true; value: SaleTotals } | { ok: false; error: string } {
  const subtotal = round2(lines.reduce((s, l) => s + lineTotal(l.unitPrice, l.quantity, l.unitCode), 0))
  if (discount > subtotal) return { ok: false, error: 'The discount is more than the total of the items.' }
  return { ok: true, value: { subtotal, discount: round2(discount), total: round2(subtotal - discount) } }
}

/** Change to hand back for a cash sale. An empty "cash received" means exact money. */
export function cashChange(total: number, tendered: number | null): { ok: true; change: number } | { ok: false; error: string } {
  if (tendered === null) return { ok: true, change: 0 }
  if (tendered < total) return { ok: false, error: 'The cash received is less than the total.' }
  return { ok: true, change: round2(tendered - total) }
}

/**
 * Who paid what in a (possibly split) sale: the parts first, then the rest on the main method.
 * The parts must leave something for the main method; otherwise the cashier should simply pick that method.
 */
export function splitPayments(total: number, main: PosPaymentMethod, parts: PaymentPart[]): { ok: true; value: PaymentPart[]; rest: number } | { ok: false; error: string } {
  const other = round2(parts.reduce((s, p) => s + p.amount, 0))
  if (parts.length === 0) return { ok: true, value: [{ method: main, amount: total }], rest: total }
  if (other >= total) return { ok: false, error: 'The split amounts add up to the whole total or more. Lower them, or remove the split and choose that way of paying.' }
  const rest = round2(total - other)
  return { ok: true, value: [{ method: main, amount: rest }, ...parts.map((p) => ({ method: p.method, amount: round2(p.amount) }))], rest }
}

/** Today's takings from the payments themselves, so a split sale adds to each method what was really paid that way. */
export function tillFromPayments(sales: { cancelled: boolean; payments: { method: string; amount: number }[] }[]) {
  const by = new Map<string, { count: number; total: number }>()
  let count = 0, total = 0
  for (const s of sales) {
    if (s.cancelled) continue
    count += 1
    for (const p of s.payments) {
      const cur = by.get(p.method) ?? { count: 0, total: 0 }
      cur.count += 1; cur.total = round2(cur.total + p.amount)
      by.set(p.method, cur); total = round2(total + p.amount)
    }
  }
  return { count, total, byMethod: POS_PAYMENT_METHODS.filter((m) => by.has(m)).map((m) => ({ method: m, ...by.get(m)! })) }
}

/**
 * A barcode scanner types the code and presses Enter. Which item did it mean? An exact barcode or SKU match wins;
 * otherwise, if the search has narrowed to a single item, that one. Anything else: nothing is added (no guessing).
 */
export function scanMatch<T extends { sku: string; barcode?: string | null }>(items: T[], shown: T[], typed: string): T | null {
  const t = typed.trim().toLowerCase()
  if (!t) return null
  const exact = items.filter((i) => (i.barcode ?? '').toLowerCase() === t || i.sku.toLowerCase() === t)
  if (exact.length === 1) return exact[0]
  return exact.length === 0 && shown.length === 1 ? shown[0] : null
}

/** Today's takings per payment method, ignoring sales that were cancelled (voided). */
export function tillSummary(rows: { method: string; total: number; cancelled: boolean }[]) {
  const by = new Map<string, { count: number; total: number }>()
  let count = 0, total = 0
  for (const r of rows) {
    if (r.cancelled) continue
    const cur = by.get(r.method) ?? { count: 0, total: 0 }
    cur.count += 1; cur.total = round2(cur.total + r.total)
    by.set(r.method, cur)
    count += 1; total = round2(total + r.total)
  }
  return { count, total, byMethod: POS_PAYMENT_METHODS.filter((m) => by.has(m)).map((m) => ({ method: m, ...by.get(m)! })) }
}
