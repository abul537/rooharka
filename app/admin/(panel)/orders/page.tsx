import Link from 'next/link'
import type { Prisma } from '@/lib/generated/prisma/client'
import { requireAdmin } from '@/lib/auth/guard'
import { db } from '@/lib/db'
import { formatPrice } from '@/lib/format'
import { formatPkt } from '@/lib/admin/dates'
import { label } from '@/lib/admin/order-rules'
import StatusBadge from '@/components/admin/StatusBadge'

export const dynamic = 'force-dynamic'
const PAGE = 25
const STATUSES = ['PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED'] as const

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string; pay?: string }> }) {
  const admin = await requireAdmin('orders.view')
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)
  const q = (sp.q ?? '').trim().slice(0, 60)
  const status = STATUSES.find((s) => s === sp.status)

  const where: Prisma.OrderWhereInput = { storeId: admin.storeId }
  if (status) where.status = status
  if (sp.pay === 'pending') where.payments = { some: { status: 'PENDING', method: { not: 'COD' } } }
  if (q) where.OR = [
    { number: { contains: q } }, { trackingCode: { contains: q.toUpperCase() } },
    { customerName: { contains: q, mode: 'insensitive' } }, { customerPhone: { contains: q.replace(/[^\d+]/g, '') || q } },
  ]

  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({ where, orderBy: { placedAt: 'desc' }, skip: (page - 1) * PAGE, take: PAGE,
      select: { id: true, number: true, customerName: true, cityName: true, total: true, status: true, paymentStatus: true, placedAt: true } }),
  ])
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const href = (p: number, s = status, pay = sp.pay) => {
    const u = new URLSearchParams()
    if (s) u.set('status', s); if (q) u.set('q', q); if (pay) u.set('pay', pay); if (p > 1) u.set('page', String(p))
    const qs = u.toString(); return `/admin/orders${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-bold mb-4">Orders</h1>
      <form className="flex gap-2 mb-4" role="search">
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={q} placeholder="Search order no., name, phone or tracking code" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button className="rounded-lg bg-slate-900 text-white px-4 text-sm">Search</button>
      </form>
      <div className="flex gap-2 overflow-x-auto mb-4 text-sm">
        <Link href={href(1, undefined, undefined)} className={`rounded-full px-3 py-1 border ${!status && !sp.pay ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-300'}`}>All</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={href(1, s, undefined)} className={`rounded-full px-3 py-1 border whitespace-nowrap ${status === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-300'}`}>{label(s)}</Link>
        ))}
      </div>
      {sp.pay === 'pending' && <p className="mb-3 text-sm text-amber-800">Showing orders with an unchecked advance payment. <Link className="underline" href="/admin/orders">Clear</Link></p>}

      <div className="rounded-xl bg-white border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 border-b border-slate-200">
            <tr><th className="p-3">Order</th><th className="p-3">Customer</th><th className="p-3">Total</th><th className="p-3">Status</th><th className="p-3">Payment</th><th className="p-3">Placed</th></tr>
          </thead>
          <tbody>
            {orders.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">No orders found.</td></tr>}
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="p-3 font-medium"><Link className="underline" href={`/admin/orders/${o.id}`}>#{o.number}</Link></td>
                <td className="p-3">{o.customerName}<span className="block text-xs text-slate-500">{o.cityName}</span></td>
                <td className="p-3 whitespace-nowrap">{formatPrice(o.total.toNumber())}</td>
                <td className="p-3"><StatusBadge status={o.status} /></td>
                <td className="p-3"><StatusBadge status={o.paymentStatus} /></td>
                <td className="p-3 whitespace-nowrap text-slate-600">{formatPkt(o.placedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-4 text-sm">
        <span className="text-slate-600">{total} order{total === 1 ? '' : 's'} · page {page} of {pages}</span>
        <span className="flex gap-3">
          {page > 1 && <Link className="underline" href={href(page - 1)}>Previous</Link>}
          {page < pages && <Link className="underline" href={href(page + 1)}>Next</Link>}
        </span>
      </div>
    </div>
  )
}
