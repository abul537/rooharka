/**
 * The arithmetic behind the Overview page ("daily radar"): periods, change against the period before, average
 * order value, conversion rate, the day-by-day chart and the to-do list. Pure (no database), so it is all tested.
 */
const PKT_MS = 5 * 3600_000 // Pakistan has no daylight saving: always UTC+5
const DAY_MS = 86_400_000

export const PERIODS = ['today', '7d', '30d', '90d'] as const
export type Period = (typeof PERIODS)[number]
export const PERIOD_DAYS: Record<Period, number> = { today: 1, '7d': 7, '30d': 30, '90d': 90 }
export const PERIOD_LABEL: Record<Period, string> = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days' }
export const PREVIOUS_LABEL: Record<Period, string> = { today: 'yesterday', '7d': 'the 7 days before', '30d': 'the 30 days before', '90d': 'the 90 days before' }
export const parsePeriod = (raw: string | string[] | undefined): Period => PERIODS.find((p) => p === (Array.isArray(raw) ? raw[0] : raw)) ?? '7d'

/** "2026-11-14" for the Pakistan calendar day a moment falls in. */
export const pktDay = (d: Date) => new Date(d.getTime() + PKT_MS).toISOString().slice(0, 10)

/**
 * The period and the equally long period just before it (for "up 12% on the 7 days before").
 * `from` = midnight (Pakistan time) that starts the period; today is always included.
 */
export function periodRange(period: Period, now = new Date()): { from: Date; prevFrom: Date; days: number; fromDay: string; prevFromDay: string } {
  const days = PERIOD_DAYS[period]
  const pkt = new Date(now.getTime() + PKT_MS)
  const midnight = Date.UTC(pkt.getUTCFullYear(), pkt.getUTCMonth(), pkt.getUTCDate()) - PKT_MS
  const from = new Date(midnight - (days - 1) * DAY_MS), prevFrom = new Date(from.getTime() - days * DAY_MS)
  return { from, prevFrom, days, fromDay: pktDay(from), prevFromDay: pktDay(prevFrom) }
}

/** Change in percent (one decimal). null = there was nothing before, so a percentage would be meaningless ("new"). */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / previous) * 1000) / 10
}
/** Average order value in whole rupees; 0 when there were no orders. */
export const averageOrder = (sales: number, orders: number) => (orders > 0 ? Math.round(sales / orders) : 0)
/** Online orders per 100 visitors (one decimal). null when no visitors were counted (never a made-up number). */
export const conversionRate = (onlineOrders: number, visitors: number) => (visitors > 0 ? Math.round((onlineOrders / visitors) * 1000) / 10 : null)

export interface DayPoint { day: string; sales: number; orders: number }
/** Every day of the period in order, with zeros for days without sales (so the chart never skips a day). */
export function fillDays(rows: DayPoint[], from: Date, days: number): DayPoint[] {
  const have = new Map(rows.map((r) => [r.day, r]))
  return Array.from({ length: days }, (_, i) => { const day = pktDay(new Date(from.getTime() + i * DAY_MS)); return have.get(day) ?? { day, sales: 0, orders: 0 } })
}

/** A round number at or above `max` for the top of the chart (1, 2, 2.5, 5 or 10 times a power of ten). */
export function niceMax(max: number): number {
  if (!(max > 0)) return 100
  const pow = 10 ** Math.floor(Math.log10(max))
  for (const m of [1, 2, 2.5, 5, 10]) if (max <= m * pow) return m * pow
  return 10 * pow
}
export interface Bar { x: number; y: number; w: number; h: number; day: string; sales: number; orders: number }
/** Bar positions for the sales chart inside a `width` x `height` drawing. A day with sales always gets a visible bar. */
export function chartBars(series: DayPoint[], width: number, height: number): { bars: Bar[]; top: number } {
  const top = niceMax(Math.max(0, ...series.map((p) => p.sales)))
  const slot = series.length ? width / series.length : width
  const w = Math.max(1, Math.min(48, slot * 0.7))
  return { top, bars: series.map((p, i) => { const h = p.sales > 0 ? Math.max(2, (p.sales / top) * height) : 0; return { x: i * slot + (slot - w) / 2, y: height - h, w, h, day: p.day, sales: p.sales, orders: p.orders } }) }
}
/** "14 Nov" from "2026-11-14". */
export const shortDay = (day: string) => { const [, m, d] = day.split('-').map(Number); return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] ?? ''}` }

// ------------------------------------------------------------------ the to-do list
export interface TaskCounts { toConfirm: number; paymentsToCheck: number; toPack: number; toShip: number; bookingsToCheck: number; lowStock: number; unreadMessages: number }
export interface Task { key: keyof TaskCounts; text: string; href: string; urgent: boolean }
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** What needs the owner's attention right now, most urgent first. Nothing to do = an empty list. */
export function buildTasks(c: TaskCounts): Task[] {
  const all: Task[] = [
    { key: 'paymentsToCheck', urgent: true, href: '/admin/orders?pay=pending', text: `${n(c.paymentsToCheck, 'advance payment is', 'advance payments are')} waiting for your check` },
    { key: 'toConfirm', urgent: true, href: '/admin/orders?status=PLACED', text: `${n(c.toConfirm, 'new order', 'new orders')} to confirm` },
    { key: 'toPack', urgent: false, href: '/admin/orders?status=CONFIRMED', text: `${n(c.toPack, 'order', 'orders')} to pack` },
    { key: 'toShip', urgent: false, href: '/admin/orders?status=PACKED', text: `${n(c.toShip, 'packed order', 'packed orders')} to hand to the courier` },
    { key: 'bookingsToCheck', urgent: true, href: '/admin/orders?status=PLACED', text: `${n(c.bookingsToCheck, 'courier booking needs', 'courier bookings need')} checking` },
    { key: 'unreadMessages', urgent: false, href: '/admin/messages', text: `${n(c.unreadMessages, 'unread message', 'unread messages')} from customers` },
    { key: 'lowStock', urgent: false, href: '/admin/products?stock=low', text: `${n(c.lowStock, 'item is', 'items are')} low on stock` },
  ]
  return all.filter((t) => c[t.key] > 0).sort((a, b) => Number(b.urgent) - Number(a.urgent))
}

// ------------------------------------------------------------------ visitors
/** Visitors seen in the last few minutes count as "on your shop right now". */
export const LIVE_WINDOW_MS = 5 * 60_000
export const VISIT_KEEP_DAYS = 120
/** Search-engine crawlers, link previews and monitoring tools are not customers. */
export const isBot = (userAgent: string | null | undefined) => !userAgent || userAgent.length < 20 || /bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|facebookexternalhit|whatsapp|curl|wget|python|axios|node-fetch|go-http/i.test(userAgent)
