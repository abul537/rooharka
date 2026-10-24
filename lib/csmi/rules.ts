/**
 * CSMI (platform-owner dashboard) business rules. Pure functions, no database, so every number the
 * owner sees on the dashboard is unit-tested.
 *
 * Money rules in one place:
 *  - MRR (monthly recurring revenue) counts a store only while the store is ACTIVE *and* its subscription
 *    is ACTIVE. Trials, past-due and suspended stores are shown separately ("at risk"), never inside MRR,
 *    so the headline number is money the owner can actually count on.
 *  - A yearly subscription counts as one twelfth of its price each month.
 *  - Add-on fees (services the owner charges for) count only for stores that count for MRR.
 *  - Costs are monthly. A cost attached to one store hits that store; a shared cost (hosting, database)
 *    is split equally across the live stores.
 */

export type BillingInterval = 'MONTHLY' | 'YEARLY'
export type StoreStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED'
export type SubStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED'

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const DAY = 86_400_000

// ------------------------------------------------------------------- pricing
/** A period longer than ~7 months is a yearly subscription. */
export function intervalOf(start: Date, end: Date): BillingInterval {
  return (end.getTime() - start.getTime()) / DAY > 200 ? 'YEARLY' : 'MONTHLY'
}

/** What the store is charged per billing period: a negotiated price wins, else the plan's price. */
export function periodPrice(plan: { monthlyPrice: number; yearlyPrice: number | null }, interval: BillingInterval, override: number | null): number {
  if (override !== null && override >= 0) return override
  if (interval === 'YEARLY') return plan.yearlyPrice ?? plan.monthlyPrice * 12
  return plan.monthlyPrice
}

export const monthlyEquivalent = (price: number, interval: BillingInterval) => (interval === 'YEARLY' ? price / 12 : price)

/** A store's own slice of recurring revenue. */
export interface RevenueInput {
  storeStatus: StoreStatus
  subStatus: SubStatus | null
  /** Per-period plan price already resolved (override applied); null when the store has no subscription. */
  price: number | null
  interval: BillingInterval
  /** Monthly add-on fees for enabled paid services. */
  addOnMonthly: number
}

export type RevenueBucket = 'MRR' | 'AT_RISK' | 'TRIAL' | 'NONE'

export function revenueBucket(i: Pick<RevenueInput, 'storeStatus' | 'subStatus' | 'price'>): RevenueBucket {
  if (i.storeStatus === 'SUSPENDED' || i.storeStatus === 'CANCELLED' || i.subStatus === 'CANCELLED' || i.subStatus === null || i.price === null) return 'NONE'
  if (i.storeStatus === 'ACTIVE' && i.subStatus === 'ACTIVE') return 'MRR'
  if (i.subStatus === 'TRIALING' || i.storeStatus === 'TRIAL') return 'TRIAL'
  return 'AT_RISK' // past due
}

export function storeMonthly(i: RevenueInput): number {
  return i.price === null ? 0 : round2(monthlyEquivalent(i.price, i.interval) + i.addOnMonthly)
}

export interface RevenueTotals { mrr: number; arr: number; atRisk: number; trial: number; payingStores: number }
export function totalRevenue(items: RevenueInput[]): RevenueTotals {
  const t = { mrr: 0, atRisk: 0, trial: 0, payingStores: 0 }
  for (const i of items) {
    const m = storeMonthly(i)
    switch (revenueBucket(i)) {
      case 'MRR': t.mrr += m; t.payingStores++; break
      case 'AT_RISK': t.atRisk += m; break
      case 'TRIAL': t.trial += m; break
    }
  }
  return { mrr: round2(t.mrr), arr: round2(t.mrr * 12), atRisk: round2(t.atRisk), trial: round2(t.trial), payingStores: t.payingStores }
}

// --------------------------------------------------------------------- costs
export interface CostInput { id: string; monthlyAmount: number; storeId: string | null; isActive: boolean }

/**
 * Per-store monthly cost: its own costs plus an equal share of every shared cost.
 * `liveStoreIds` are the stores sharing overhead (not suspended or cancelled). Shared cost that nobody can
 * carry (no live stores) is reported as `unallocated` instead of vanishing.
 */
export function allocateCosts(costs: CostInput[], liveStoreIds: string[]): { perStore: Map<string, number>; shared: number; unallocated: number; total: number } {
  const perStore = new Map<string, number>(liveStoreIds.map((id) => [id, 0]))
  let shared = 0, unallocated = 0, total = 0
  for (const c of costs) {
    if (!c.isActive || !(c.monthlyAmount > 0)) continue
    total += c.monthlyAmount
    if (c.storeId) {
      // A store-specific cost always counts against that store, even if the store is no longer "live".
      perStore.set(c.storeId, (perStore.get(c.storeId) ?? 0) + c.monthlyAmount)
    } else {
      shared += c.monthlyAmount
    }
  }
  if (liveStoreIds.length === 0) unallocated = shared
  else for (const id of liveStoreIds) perStore.set(id, (perStore.get(id) ?? 0) + shared / liveStoreIds.length)
  for (const [k, v] of perStore) perStore.set(k, round2(v))
  return { perStore, shared: round2(shared), unallocated: round2(unallocated), total: round2(total) }
}

export interface Profit { revenue: number; cost: number; profit: number; marginPct: number | null }
export function profitOf(revenue: number, cost: number): Profit {
  const profit = round2(revenue - cost)
  return { revenue: round2(revenue), cost: round2(cost), profit, marginPct: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null }
}

// -------------------------------------------------------------------- health
export interface HealthInput {
  storeStatus: StoreStatus
  hasSubscription: boolean
  overdueInvoices: number
  integrationErrors: number
  openTickets: number
  ordersInWindow: number
  /** Whole days since the newest order, or null when the store never had one. */
  daysSinceLastOrder: number | null
  storeAgeDays: number
  cancelledOrReturned: number
}
export interface HealthFlag { level: 'critical' | 'warning'; text: string }

export const QUIET_DAYS = 14
export const HIGH_FAILURE_RATE = 0.3

/** What needs the owner's attention for this store, most serious first. Suspended/cancelled stores raise no alarms. */
export function healthFlags(h: HealthInput): HealthFlag[] {
  if (h.storeStatus === 'SUSPENDED' || h.storeStatus === 'CANCELLED') return []
  const out: HealthFlag[] = []
  if (h.overdueInvoices > 0) out.push({ level: 'critical', text: `${h.overdueInvoices} overdue invoice${h.overdueInvoices === 1 ? '' : 's'}` })
  if (h.integrationErrors > 0) out.push({ level: 'critical', text: `${h.integrationErrors} integration${h.integrationErrors === 1 ? '' : 's'} failing (the owner's SMS, courier or photo account)` })
  if (h.storeStatus === 'ACTIVE' && !h.hasSubscription) out.push({ level: 'warning', text: 'No subscription set up: this store is not counted in revenue' })
  if (h.ordersInWindow >= 10 && h.cancelledOrReturned / h.ordersInWindow > HIGH_FAILURE_RATE) {
    out.push({ level: 'warning', text: `${Math.round((h.cancelledOrReturned / h.ordersInWindow) * 100)}% of orders were cancelled or returned` })
  }
  if (h.storeStatus === 'ACTIVE' && h.storeAgeDays > QUIET_DAYS && (h.daysSinceLastOrder === null || h.daysSinceLastOrder > QUIET_DAYS)) {
    out.push({ level: 'warning', text: h.daysSinceLastOrder === null ? 'No orders yet: may be at risk of leaving' : `No orders for ${h.daysSinceLastOrder} days: may be at risk of leaving` })
  }
  if (h.openTickets > 0) out.push({ level: 'warning', text: `${h.openTickets} open support ticket${h.openTickets === 1 ? '' : 's'}` })
  return out.sort((a, b) => Number(b.level === 'critical') - Number(a.level === 'critical'))
}

// ------------------------------------------------------------------ invoices
/** INV-2026-0001: next number for `year`, from the numbers that already exist. */
export function nextInvoiceNumber(existing: string[], year: number): string {
  const prefix = `INV-${year}-`
  let max = 0
  for (const n of existing) {
    if (!n.startsWith(prefix)) continue
    const v = Number(n.slice(prefix.length))
    if (Number.isInteger(v) && v > max) max = v
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

/** The start of the next billing period: one month (or twelve) later, clamped to the month's last day. */
export function addPeriod(from: Date, interval: BillingInterval): Date {
  const months = interval === 'YEARLY' ? 12 : 1
  const y = from.getUTCFullYear(), m = from.getUTCMonth() + months, d = from.getUTCDate()
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(d, lastDay), from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds()))
}

export interface InvoiceLine { label: string; amount: number }
export function invoiceTotals(lines: InvoiceLine[], taxPercent = 0): { subtotal: number; tax: number; total: number } {
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0))
  const tax = round2((subtotal * Math.max(0, taxPercent)) / 100)
  return { subtotal, tax, total: round2(subtotal + tax) }
}

/** Plan fee for the period plus one line per paid add-on (add-on fees are monthly, so a yearly period charges twelve). */
export function invoiceLines(planName: string, price: number, interval: BillingInterval, addOns: { name: string; monthlyFee: number }[]): InvoiceLine[] {
  const lines: InvoiceLine[] = [{ label: `${planName} plan (${interval === 'YEARLY' ? 'yearly' : 'monthly'})`, amount: round2(price) }]
  const months = interval === 'YEARLY' ? 12 : 1
  for (const a of addOns) if (a.monthlyFee > 0) lines.push({ label: `${a.name} add-on`, amount: round2(a.monthlyFee * months) })
  return lines
}

/** An OPEN invoice past its due date is overdue even before anyone ran the billing sweep. */
export function effectiveInvoiceStatus(status: string, dueDate: Date, now = new Date()): string {
  return status === 'OPEN' && dueDate.getTime() < now.getTime() ? 'OVERDUE' : status
}

// ----------------------------------------------------------------------- csv
/** Spreadsheet programs run cells that start with = + - @ as formulas, so those are neutralised with a leading '. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const toCsv = (headers: string[], rows: unknown[][]) => [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'

// ------------------------------------------------------------------ platform
export type PlatformPermission = 'csmi.view' | 'csmi.manage'
/** The owner manages everything; support staff can look but not change money or stores. */
export function canPlatform(role: string, p: PlatformPermission): boolean {
  if (role === 'PLATFORM_OWNER') return true
  return role === 'PLATFORM_SUPPORT' && p === 'csmi.view'
}
export const isPlatformRole = (role: string) => role === 'PLATFORM_OWNER' || role === 'PLATFORM_SUPPORT'

/** URL-safe store address: lowercase letters, digits and dashes, 3 to 30 characters. */
export const isValidSlug = (s: string) => /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/.test(s)
