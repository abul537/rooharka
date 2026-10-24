import { db } from '@/lib/db'
import { startOfPktDay } from '@/lib/admin/dates'
import {
  allocateCosts, effectiveInvoiceStatus, healthFlags, intervalOf, periodPrice, profitOf, revenueBucket, storeMonthly, totalRevenue,
  type BillingInterval, type HealthFlag, type Profit, type RevenueBucket, type RevenueInput, type RevenueTotals, type StoreStatus, type SubStatus,
} from '@/lib/csmi/rules'

const num = (d: { toNumber(): number } | null | undefined) => (d ? d.toNumber() : 0)
const DAY = 86_400_000

export interface StoreRow {
  id: string; name: string; slug: string; status: StoreStatus
  ownerName: string; ownerEmail: string; ownerPhone: string | null; createdAt: Date
  planName: string | null; subStatus: SubStatus | null; interval: BillingInterval; price: number | null
  bucket: RevenueBucket; addOnMonthly: number; monthly: number
  orders: number; gmv: number; delivered: number; cancelled: number; returned: number; deliveredRate: number | null
  lastOrderAt: Date | null; daysSinceLastOrder: number | null
  otpSent: number; otpVerified: number
  integrationErrors: number; openTickets: number; overdueInvoices: number; overdueAmount: number
  cost: number; profit: Profit
  flags: HealthFlag[]
}

export interface ServiceUsage { key: string; name: string; type: string; enabledStores: number; failing: number; monthlyFee: number }

export interface PlatformSnapshot {
  windowDays: number
  rows: StoreRow[]
  revenue: RevenueTotals
  costs: { total: number; shared: number; unallocated: number }
  profit: Profit
  collectedThisMonth: number
  outstanding: number
  overdueAmount: number
  statusCounts: Record<StoreStatus, number>
  services: ServiceUsage[]
  windowOrders: number
  windowGmv: number
}

/**
 * Everything the owner dashboard shows, for ALL stores, in a handful of parallel queries
 * (one grouped query per measure, never one per store). Numbers are computed live from orders,
 * so there is no nightly job to forget.
 */
export async function loadPlatform(windowDays = 30, now = new Date()): Promise<PlatformSnapshot> {
  const since = startOfPktDay(windowDays - 1, now)
  const monthStart = startOfPktDay(Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric' }).format(now)) - 1, now)

  const [stores, byStatus, lastOrders, overdue, openInv, tickets, otpSent, otpVerified, costRows, paidThisMonth] = await Promise.all([
    db.store.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        subscription: { include: { plan: true } },
        services: { where: { enabled: true }, select: { serviceKey: true, platformFee: true, lastError: true, service: { select: { name: true, type: true, platformFee: true } } } },
      },
    }),
    db.order.groupBy({ by: ['storeId', 'status'], where: { placedAt: { gte: since } }, _count: { _all: true }, _sum: { total: true } }),
    db.order.groupBy({ by: ['storeId'], _max: { placedAt: true } }),
    db.invoice.groupBy({ by: ['storeId'], where: { status: { in: ['OPEN', 'OVERDUE'] }, dueDate: { lt: now } }, _count: { _all: true }, _sum: { total: true } }),
    db.invoice.aggregate({ where: { status: { in: ['OPEN', 'OVERDUE'] } }, _sum: { total: true } }),
    db.supportTicket.groupBy({ by: ['storeId'], where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_STORE'] } }, _count: { _all: true } }),
    db.phoneVerification.groupBy({ by: ['storeId'], where: { sentAt: { gte: since } }, _count: { _all: true } }),
    db.phoneVerification.groupBy({ by: ['storeId'], where: { sentAt: { gte: since }, verifiedAt: { not: null } }, _count: { _all: true } }),
    db.platformCost.findMany(),
    db.invoice.aggregate({ where: { status: 'PAID', paidAt: { gte: monthStart } }, _sum: { total: true } }),
  ])

  const orderStats = new Map<string, { orders: number; gmv: number; delivered: number; cancelled: number; returned: number }>()
  for (const g of byStatus) {
    const s = orderStats.get(g.storeId) ?? { orders: 0, gmv: 0, delivered: 0, cancelled: 0, returned: 0 }
    s.orders += g._count._all
    if (g.status === 'CANCELLED') s.cancelled += g._count._all
    else if (g.status === 'RETURNED') s.returned += g._count._all
    else s.gmv += num(g._sum.total) // sales that still stand
    if (g.status === 'DELIVERED') s.delivered += g._count._all
    orderStats.set(g.storeId, s)
  }
  const lastOrderAt = new Map(lastOrders.map((g) => [g.storeId, g._max.placedAt]))
  const overdueBy = new Map(overdue.map((g) => [g.storeId, { n: g._count._all, amount: num(g._sum.total) }]))
  const ticketsBy = new Map(tickets.map((g) => [g.storeId, g._count._all]))
  const otpSentBy = new Map(otpSent.map((g) => [g.storeId, g._count._all]))
  const otpOkBy = new Map(otpVerified.map((g) => [g.storeId, g._count._all]))

  // Costs: shared overhead is carried by stores that are still live.
  const live = stores.filter((s) => s.status !== 'SUSPENDED' && s.status !== 'CANCELLED').map((s) => s.id)
  const alloc = allocateCosts(costRows.map((c) => ({ id: c.id, monthlyAmount: num(c.monthlyAmount), storeId: c.storeId, isActive: c.isActive })), live)

  const serviceMap = new Map<string, ServiceUsage>()
  const rows: StoreRow[] = stores.map((s) => {
    const sub = s.subscription
    const interval = sub ? intervalOf(sub.currentPeriodStart, sub.currentPeriodEnd) : 'MONTHLY'
    const price = sub ? periodPrice({ monthlyPrice: num(sub.plan.monthlyPrice), yearlyPrice: sub.plan.yearlyPrice ? num(sub.plan.yearlyPrice) : null }, interval, sub.priceOverride ? num(sub.priceOverride) : null) : null

    let addOnMonthly = 0, integrationErrors = 0
    for (const sv of s.services) {
      const fee = sv.platformFee ? num(sv.platformFee) : num(sv.service.platformFee)
      addOnMonthly += fee
      if (sv.lastError) integrationErrors++
      const u = serviceMap.get(sv.serviceKey) ?? { key: sv.serviceKey, name: sv.service.name, type: sv.service.type, enabledStores: 0, failing: 0, monthlyFee: 0 }
      u.enabledStores++; if (sv.lastError) u.failing++; u.monthlyFee += fee
      serviceMap.set(sv.serviceKey, u)
    }

    const input: RevenueInput = { storeStatus: s.status, subStatus: sub?.status ?? null, price, interval, addOnMonthly }
    const o = orderStats.get(s.id) ?? { orders: 0, gmv: 0, delivered: 0, cancelled: 0, returned: 0 }
    const last = lastOrderAt.get(s.id) ?? null
    const daysSince = last ? Math.floor((now.getTime() - last.getTime()) / DAY) : null
    const od = overdueBy.get(s.id) ?? { n: 0, amount: 0 }
    const bucket = revenueBucket(input)
    const monthly = bucket === 'NONE' ? 0 : storeMonthly(input)
    const cost = alloc.perStore.get(s.id) ?? 0
    const openTickets = ticketsBy.get(s.id) ?? 0

    return {
      id: s.id, name: s.name, slug: s.slug, status: s.status, ownerName: s.ownerName, ownerEmail: s.ownerEmail, ownerPhone: s.ownerPhone, createdAt: s.createdAt,
      planName: sub?.plan.name ?? null, subStatus: sub?.status ?? null, interval, price, bucket, addOnMonthly, monthly,
      orders: o.orders, gmv: o.gmv, delivered: o.delivered, cancelled: o.cancelled, returned: o.returned,
      deliveredRate: o.orders > 0 ? o.delivered / o.orders : null,
      lastOrderAt: last, daysSinceLastOrder: daysSince,
      otpSent: otpSentBy.get(s.id) ?? 0, otpVerified: otpOkBy.get(s.id) ?? 0,
      integrationErrors, openTickets, overdueInvoices: od.n, overdueAmount: od.amount,
      cost, profit: profitOf(bucket === 'MRR' ? monthly : 0, cost),
      flags: healthFlags({
        storeStatus: s.status, hasSubscription: !!sub, overdueInvoices: od.n, integrationErrors, openTickets,
        ordersInWindow: o.orders, daysSinceLastOrder: daysSince, storeAgeDays: Math.floor((now.getTime() - s.createdAt.getTime()) / DAY),
        cancelledOrReturned: o.cancelled + o.returned,
      }),
    }
  })

  const revenue = totalRevenue(stores.map((s, i) => ({
    storeStatus: s.status, subStatus: s.subscription?.status ?? null, price: rows[i].price, interval: rows[i].interval, addOnMonthly: rows[i].addOnMonthly,
  })))
  const statusCounts: Record<StoreStatus, number> = { TRIAL: 0, ACTIVE: 0, PAST_DUE: 0, SUSPENDED: 0, CANCELLED: 0 }
  for (const s of stores) statusCounts[s.status]++

  return {
    windowDays, rows, revenue,
    costs: { total: alloc.total, shared: alloc.shared, unallocated: alloc.unallocated },
    // Profit compares what is counted on (MRR) with what it costs to run, every month.
    profit: profitOf(revenue.mrr, alloc.total),
    collectedThisMonth: num(paidThisMonth._sum.total),
    outstanding: num(openInv._sum.total),
    overdueAmount: [...overdueBy.values()].reduce((a, b) => a + b.amount, 0),
    statusCounts,
    services: [...serviceMap.values()].sort((a, b) => b.enabledStores - a.enabledStores),
    windowOrders: rows.reduce((a, r) => a + r.orders, 0),
    windowGmv: rows.reduce((a, r) => a + r.gmv, 0),
  }
}

/** Invoices for the billing page; status shown as "overdue" as soon as the due date passes. */
export async function listInvoices(filter: 'all' | 'open' | 'overdue' | 'paid', now = new Date()) {
  const rows = await db.invoice.findMany({
    orderBy: { createdAt: 'desc' }, take: 200,
    include: { store: { select: { id: true, name: true } } },
  })
  return rows
    .map((i) => ({ ...i, total: num(i.total), shownStatus: effectiveInvoiceStatus(i.status, i.dueDate, now) }))
    .filter((i) => (filter === 'all' ? true : filter === 'paid' ? i.shownStatus === 'PAID' : filter === 'overdue' ? i.shownStatus === 'OVERDUE' : i.shownStatus === 'OPEN' || i.shownStatus === 'OVERDUE'))
}
