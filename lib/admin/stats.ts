import { db } from '@/lib/db'
import { startOfPktDay } from './dates'

/** Orders that count as real sales (not cancelled / returned). */
const LIVE = { notIn: ['CANCELLED', 'RETURNED'] as ('CANCELLED' | 'RETURNED')[] }

async function range(storeId: string, from: Date) {
  const r = await db.order.aggregate({
    where: { storeId, placedAt: { gte: from }, status: LIVE },
    _count: true, _sum: { total: true },
  })
  return { orders: r._count, revenue: r._sum.total?.toNumber() ?? 0 }
}

export async function getOverview(storeId: string) {
  const [today, week, month, toConfirm, pendingPayments, lowStock, recent] = await Promise.all([
    range(storeId, startOfPktDay(0)),
    range(storeId, startOfPktDay(6)),
    range(storeId, startOfPktDay(29)),
    db.order.count({ where: { storeId, status: 'PLACED' } }),
    db.payment.count({ where: { status: 'PENDING', method: { not: 'COD' }, order: { storeId, status: { notIn: ['CANCELLED', 'RETURNED'] } } } }),
    db.productVariant.findMany({
      where: { isActive: true, trackStock: true, stock: { lte: 10 }, product: { storeId } },
      select: { id: true, label: true, stock: true, product: { select: { name: true } } },
      orderBy: { stock: 'asc' }, take: 8,
    }),
    db.order.findMany({
      where: { storeId }, orderBy: { placedAt: 'desc' }, take: 8,
      select: { id: true, number: true, customerName: true, total: true, status: true, placedAt: true },
    }),
  ])
  return { today, week, month, toConfirm, pendingPayments, lowStock, recent }
}
