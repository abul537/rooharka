import { db } from '@/lib/db'
import { memoKeyed } from '@/lib/memo'
import { LOW_STOCK_AT } from '@/lib/admin/product-extras'
import { LIVE_WINDOW_MS, averageOrder, buildTasks, conversionRate, fillDays, pctChange, periodRange, type DayPoint, type Period } from '@/lib/admin/insights'

/** Orders that count as real sales (not cancelled / returned). */
const LIVE = { notIn: ['CANCELLED', 'RETURNED'] as ('CANCELLED' | 'RETURNED')[] }

async function totals(storeId: string, from: Date, to?: Date) {
  const rows = await db.order.groupBy({
    by: ['source'], where: { storeId, placedAt: { gte: from, ...(to ? { lt: to } : {}) }, status: LIVE },
    _count: { _all: true }, _sum: { total: true },
  })
  const pick = (source: string) => { const r = (rows as { source: string; _count: { _all: number }; _sum: { total: { toNumber(): number } | null } }[]).find((x) => x.source === source); return { orders: r?._count._all ?? 0, sales: r?._sum.total?.toNumber() ?? 0 } }
  const online = pick('ONLINE'), counter = pick('POS')
  return { online, counter, orders: online.orders + counter.orders, sales: online.sales + counter.sales }
}

/**
 * Everything the Overview page shows, for one store and one period. Read straight from the same tables the shop,
 * the Orders page and the POS write to (one source of truth), so a sale made anywhere shows here.
 * The answer is remembered for 20 seconds per store and period: the page refreshes itself every 30 seconds, and
 * several staff looking at once must not multiply the database work.
 */
const load = memoKeyed(20_000, async (key: string) => {
  const [storeId, period] = key.split('|') as [string, Period]
  const now = new Date()
  const r = periodRange(period, now)
  const [cur, prev, series, visitors, prevVisitors, live, toConfirm, paymentsToCheck, toPack, toShip, bookingsToCheck, lowStockCount, unreadMessages, lowStock, recent, top] = await Promise.all([
    totals(storeId, r.from),
    totals(storeId, r.prevFrom, r.from),
    // Day-by-day sales, grouped by the Pakistan calendar day, inside the database (never thousands of rows in memory).
    db.$queryRaw<DayPoint[]>`
      SELECT to_char(("placedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS orders, COALESCE(SUM("total"), 0)::float8 AS sales
      FROM "Order"
      WHERE "storeId" = ${storeId} AND "placedAt" >= ${r.from} AND "status" NOT IN ('CANCELLED', 'RETURNED')
      GROUP BY 1 ORDER BY 1`,
    db.visitorDay.count({ where: { storeId, day: { gte: r.fromDay } } }),
    db.visitorDay.count({ where: { storeId, day: { gte: r.prevFromDay, lt: r.fromDay } } }),
    db.visitorDay.count({ where: { storeId, lastSeenAt: { gte: new Date(now.getTime() - LIVE_WINDOW_MS) } } }),
    db.order.count({ where: { storeId, status: 'PLACED' } }),
    db.payment.count({ where: { status: 'PENDING', method: { not: 'COD' }, order: { storeId, status: LIVE } } }),
    db.order.count({ where: { storeId, status: 'CONFIRMED' } }),
    db.order.count({ where: { storeId, status: 'PACKED' } }),
    db.shipment.count({ where: { courierTrackingNo: null, order: { storeId, status: LIVE } } }),
    db.productVariant.count({ where: { isActive: true, trackStock: true, allowBackorder: false, stock: { lte: LOW_STOCK_AT }, product: { storeId, status: 'ACTIVE', type: { not: 'MEASURABLE' } } } }),
    db.contactMessage.count({ where: { storeId, isRead: false } }),
    db.productVariant.findMany({
      where: { isActive: true, trackStock: true, allowBackorder: false, stock: { lte: LOW_STOCK_AT }, product: { storeId, status: 'ACTIVE', type: { not: 'MEASURABLE' } } },
      select: { id: true, label: true, stock: true, product: { select: { id: true, name: true } } }, orderBy: { stock: 'asc' }, take: 6,
    }),
    db.order.findMany({
      where: { storeId }, orderBy: { placedAt: 'desc' }, take: 8,
      select: { id: true, number: true, customerName: true, total: true, status: true, placedAt: true, source: true },
    }),
    db.orderItem.groupBy({
      by: ['name'], where: { order: { storeId, placedAt: { gte: r.from }, status: LIVE } },
      _sum: { lineTotal: true }, _count: { _all: true }, orderBy: { _sum: { lineTotal: 'desc' } }, take: 5,
    }),
  ])
  const metric = (value: number, before: number) => ({ value, change: pctChange(value, before) })
  const conv = conversionRate(cur.online.orders, visitors), convBefore = conversionRate(prev.online.orders, prevVisitors)
  return {
    days: r.days,
    sales: metric(cur.sales, prev.sales),
    orders: metric(cur.orders, prev.orders),
    averageOrder: metric(averageOrder(cur.sales, cur.orders), averageOrder(prev.sales, prev.orders)),
    visitors: metric(visitors, prevVisitors),
    conversion: { value: conv, change: conv !== null && convBefore !== null ? pctChange(conv, convBefore) : null },
    online: cur.online, counter: cur.counter,
    series: fillDays(series, r.from, r.days),
    live,
    tasks: buildTasks({ toConfirm, paymentsToCheck, toPack, toShip, bookingsToCheck, lowStock: lowStockCount, unreadMessages }),
    lowStock,
    recent: recent.map((o: { id: string; number: string; customerName: string; total: { toNumber(): number }; status: string; placedAt: Date; source: string }) => ({ ...o, total: o.total.toNumber() })),
    top: (top as { name: string; _sum: { lineTotal: { toNumber(): number } | null }; _count: { _all: number } }[]).map((t) => ({ name: t.name, sales: t._sum.lineTotal?.toNumber() ?? 0, lines: t._count._all })),
  }
})

export const getOverview = (storeId: string, period: Period) => load(`${storeId}|${period}`)
export type Overview = Awaited<ReturnType<typeof getOverview>>
