/**
 * The Orders page: reading its filters from the address bar, and the rules of bulk actions.
 * Pure (no database), so it is unit-tested.
 */
import { periodRange } from '@/lib/admin/insights'
import type { OrderStatus } from '@/lib/admin/order-rules'

const PKT_MS = 5 * 3600_000
export const ORDER_PAGE_SIZE = 25
export const ORDER_STATUSES = ['PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED'] as const
export const PAY_FILTERS = ['pending', 'unpaid', 'partly', 'paid'] as const
export const PAY_LABEL: Record<(typeof PAY_FILTERS)[number], string> = { pending: 'Advance to check', unpaid: 'Unpaid', partly: 'Partly paid', paid: 'Paid' }
export const SOURCE_FILTERS = ['online', 'counter'] as const
export const WHEN_FILTERS = ['today', '7d', '30d'] as const
export const WHEN_LABEL: Record<(typeof WHEN_FILTERS)[number], string> = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days' }

export interface OrderQuery {
  q: string; status: OrderStatus | null; pay: (typeof PAY_FILTERS)[number] | null; source: (typeof SOURCE_FILTERS)[number] | null
  when: (typeof WHEN_FILTERS)[number] | null; from: string | null; to: string | null; page: number
}
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v ?? '').trim()
const pick = <T extends string>(list: readonly T[], v: string): T | null => list.find((x) => x === v) ?? null
/** A real calendar date typed as YYYY-MM-DD, or null. */
const day = (v: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && d.getUTCFullYear() >= 2020 && d.getUTCFullYear() <= 2100 ? v : null
}

/** Anything strange in the address becomes "no filter", never an error page. */
export function parseOrderQuery(sp: Record<string, string | string[] | undefined>): OrderQuery {
  const page = Number.parseInt(one(sp.page), 10)
  let from = day(one(sp.from)), to = day(one(sp.to))
  if (from && to && from > to) [from, to] = [to, from]
  const when = from || to ? null : pick(WHEN_FILTERS, one(sp.when)) // exact dates win over a shortcut
  return {
    q: one(sp.q).slice(0, 60), status: pick(ORDER_STATUSES, one(sp.status).toUpperCase()), pay: pick(PAY_FILTERS, one(sp.pay)), source: pick(SOURCE_FILTERS, one(sp.source)),
    when, from, to, page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
  }
}

/** The moment range of the date filter (Pakistan calendar days; `lt` is the midnight AFTER the last day), or null. */
export function orderDates(q: OrderQuery, now = new Date()): { gte?: Date; lt?: Date } | null {
  if (q.when) return { gte: periodRange(q.when, now).from }
  if (!q.from && !q.to) return null
  const start = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - PKT_MS)
  return { ...(q.from ? { gte: start(q.from) } : {}), ...(q.to ? { lt: new Date(start(q.to).getTime() + 86_400_000) } : {}) }
}

export const hasOrderFilters = (q: OrderQuery) => !!(q.q || q.status || q.pay || q.source || q.when || q.from || q.to)

/** The same filters as an address, with some changed. Changing a filter returns to page 1. */
export function orderHref(q: OrderQuery, change: Partial<Record<'q' | 'status' | 'pay' | 'source' | 'when' | 'from' | 'to' | 'page', string | number | null>> = {}): string {
  const base: Record<string, string | number | null> = { q: q.q || null, status: q.status, pay: q.pay, source: q.source, when: q.when, from: q.from, to: q.to, page: q.page }
  const merged = { ...base, ...('page' in change ? {} : { page: null }), ...change }
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(merged)) if (v !== null && v !== '' && !(k === 'page' && Number(v) === 1)) sp.set(k, String(v))
  const s = sp.toString()
  return s ? `/admin/orders?${s}` : '/admin/orders'
}

// ------------------------------------------------------------------ bulk actions
/**
 * Each bulk action moves an order ONE step forward, through exactly the same rule as the button on the order's
 * own page (so a bulk action can never do something a single click could not). "Delivered" also records the cash
 * collected on delivery as paid. Cancelling is deliberately not a bulk action: it restocks and may mean refunds.
 */
export const ORDER_BULK = ['confirm', 'pack', 'ship', 'deliver'] as const
export type OrderBulk = (typeof ORDER_BULK)[number]
export const ORDER_BULK_TARGET: Record<OrderBulk, OrderStatus> = { confirm: 'CONFIRMED', pack: 'PACKED', ship: 'SHIPPED', deliver: 'DELIVERED' }
export const ORDER_BULK_LABEL: Record<OrderBulk, string> = { confirm: 'Confirm', pack: 'Mark as packed', ship: 'Mark as shipped', deliver: 'Mark as delivered and paid' }
export const MAX_BULK_ORDERS = 100
/** Orders handled per round trip: small, so no request runs long and the progress bar moves steadily. */
export const BULK_STEP = 5
export const MAX_SLIPS = 50

const idOk = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v)
export function parseBulkStep(action: unknown, ids: unknown): { ok: true; action: OrderBulk; ids: string[] } | { ok: false; error: string } {
  const a = ORDER_BULK.find((x) => x === action)
  if (!a) return { ok: false, error: 'Choose what to do with the selected orders.' }
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > BULK_STEP || !ids.every(idOk)) return { ok: false, error: 'Invalid selection.' }
  return { ok: true, action: a, ids: [...new Set(ids)] }
}
/** Splits the ticked orders into the small groups sent one after another. */
export function bulkSteps(ids: string[], size = BULK_STEP): string[][] {
  const clean = [...new Set(ids)].slice(0, MAX_BULK_ORDERS)
  return Array.from({ length: Math.ceil(clean.length / size) }, (_, i) => clean.slice(i * size, i * size + size))
}
export const parseSlipIds = (raw: string | string[] | undefined): string[] => [...new Set(one(raw).split(',').filter(idOk))].slice(0, MAX_SLIPS)

export interface BulkLine { id: string; number: string | null; ok: boolean; message: string }
/** "12 done, 3 could not be changed" for the end of a run. */
export function bulkSummary(lines: BulkLine[]): string {
  const ok = lines.filter((l) => l.ok).length, bad = lines.length - ok
  return `${ok} order${ok === 1 ? '' : 's'} updated${bad ? `, ${bad} could not be changed (see below)` : ''}.`
}
