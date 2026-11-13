import Link from 'next/link'
import type { Prisma } from '@/lib/generated/prisma/client'
import { requireAdmin } from '@/lib/auth/guard'
import { can } from '@/lib/auth/permissions'
import { db } from '@/lib/db'
import { formatPrice } from '@/lib/format'
import { formatPkt } from '@/lib/admin/dates'
import { label } from '@/lib/admin/order-rules'
import { ORDER_PAGE_SIZE, ORDER_STATUSES, PAY_FILTERS, PAY_LABEL, WHEN_FILTERS, WHEN_LABEL, hasOrderFilters, orderDates, orderHref, parseOrderQuery } from '@/lib/admin/order-list'
import StatusBadge from '@/components/admin/StatusBadge'
import OrderBulkBar from '@/components/admin/OrderBulkBar'
import { inputCls } from '@/components/admin/ui'

export const dynamic = 'force-dynamic'
const PAY_WHERE = { unpaid: 'UNPAID', partly: 'PARTIALLY_PAID', paid: 'PAID' } as const
const pill = (on: boolean) => `rounded-full px-3 py-1 border whitespace-nowrap ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-300'}`

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdmin('orders.view')
  const q = parseOrderQuery(await searchParams)

  // Always starts from this store: no filter can reach another store's orders.
  const where: Prisma.OrderWhereInput = { storeId: admin.storeId }
  if (q.status) where.status = q.status
  if (q.pay === 'pending') where.payments = { some: { status: 'PENDING', method: { not: 'COD' } } }
  else if (q.pay) where.paymentStatus = PAY_WHERE[q.pay]
  if (q.source) where.source = q.source === 'counter' ? 'POS' : 'ONLINE'
  const dates = orderDates(q)
  if (dates) where.placedAt = dates
  if (q.q) where.OR = [
    { number: { contains: q.q } }, { trackingCode: { contains: q.q.toUpperCase() } },
    { customerName: { contains: q.q, mode: 'insensitive' } }, { customerPhone: { contains: q.q.replace(/[^\d+]/g, '') || q.q } },
  ]

  const [total, orders, counts] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({ where, orderBy: { placedAt: 'desc' }, skip: (q.page - 1) * ORDER_PAGE_SIZE, take: ORDER_PAGE_SIZE,
      select: { id: true, number: true, customerName: true, cityName: true, total: true, status: true, paymentStatus: true, placedAt: true, source: true, _count: { select: { items: true } } } }),
    db.order.groupBy({ by: ['status'], where: { storeId: admin.storeId }, _count: { _all: true } }),
  ])
  const pages = Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE))
  const byStatus = new Map((counts as { status: string; _count: { _all: number } }[]).map((c) => [c.status, c._count._all]))

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-bold mb-4">Orders</h1>

      <div className="flex gap-2 overflow-x-auto mb-3 text-sm">
        <Link href={orderHref(q, { status: null })} className={pill(!q.status)}>All</Link>
        {ORDER_STATUSES.map((s) => <Link key={s} href={orderHref(q, { status: s })} className={pill(q.status === s)}>{label(s)}{byStatus.get(s) ? ` (${byStatus.get(s)})` : ''}</Link>)}
      </div>

      {/* A plain GET form: the filters live in the address, so a filtered list can be bookmarked or sent to a colleague. */}
      <form method="get" action="/admin/orders" role="search" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] mb-3 items-end">
        {q.status && <input type="hidden" name="status" value={q.status} />}
        <label className="text-xs text-slate-500">Search<input name="q" defaultValue={q.q} maxLength={60} placeholder="Order no., name, phone, tracking code" className={`${inputCls} mt-1`} /></label>
        <label className="text-xs text-slate-500">Payment<select name="pay" defaultValue={q.pay ?? ''} className={`${inputCls} mt-1`}><option value="">Any</option>{PAY_FILTERS.map((p) => <option key={p} value={p}>{PAY_LABEL[p]}</option>)}</select></label>
        <label className="text-xs text-slate-500">Sold<select name="source" defaultValue={q.source ?? ''} className={`${inputCls} mt-1`}><option value="">Online and counter</option><option value="online">Online</option><option value="counter">At the counter (POS)</option></select></label>
        <label className="text-xs text-slate-500">When<select name="when" defaultValue={q.when ?? ''} className={`${inputCls} mt-1`}><option value="">Any time</option>{WHEN_FILTERS.map((w) => <option key={w} value={w}>{WHEN_LABEL[w]}</option>)}</select></label>
        <label className="text-xs text-slate-500">From date<input type="date" name="from" defaultValue={q.from ?? ''} className={`${inputCls} mt-1`} /></label>
        <label className="text-xs text-slate-500">To date<input type="date" name="to" defaultValue={q.to ?? ''} className={`${inputCls} mt-1`} /></label>
        <button className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium">Apply</button>
      </form>
      {hasOrderFilters(q) && <p className="mb-3 text-sm text-slate-600">{total} order{total === 1 ? '' : 's'} found. <Link className="underline" href="/admin/orders">Clear filters</Link></p>}

      <div className="rounded-xl bg-white border border-slate-200">
        <OrderBulkBar numbers={Object.fromEntries(orders.map((o) => [o.id, o.number]))} canUpdate={can(admin.role, 'orders.update')} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b border-slate-200">
              <tr><th className="p-3 w-8"><span className="sr-only">Select</span></th><th className="p-3">Order</th><th className="p-3">Customer</th><th className="p-3">Items</th><th className="p-3">Total</th><th className="p-3">Status</th><th className="p-3">Payment</th><th className="p-3">Placed</th></tr>
            </thead>
            <tbody>
              {orders.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-slate-500">No orders found.</td></tr>}
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="p-3"><input type="checkbox" name="orderIds" value={o.id} className="h-4 w-4" aria-label={`Select order ${o.number}`} /></td>
                  <td className="p-3 font-medium"><Link className="underline" href={`/admin/orders/${o.id}`}>#{o.number}</Link>{o.source === 'POS' && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">counter</span>}</td>
                  <td className="p-3">{o.customerName}<span className="block text-xs text-slate-500">{o.cityName}</span></td>
                  <td className="p-3">{o._count.items}</td>
                  <td className="p-3 whitespace-nowrap">{formatPrice(o.total.toNumber())}</td>
                  <td className="p-3"><StatusBadge status={o.status} /></td>
                  <td className="p-3"><StatusBadge status={o.paymentStatus} /></td>
                  <td className="p-3 whitespace-nowrap text-slate-600">{formatPkt(o.placedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex items-center justify-between mt-4 text-sm">
        <span className="text-slate-600">{total} order{total === 1 ? '' : 's'} · page {Math.min(q.page, pages)} of {pages}</span>
        <span className="flex gap-3">
          {q.page > 1 && <Link className="underline" href={orderHref(q, { page: q.page - 1 })}>Previous</Link>}
          {q.page < pages && <Link className="underline" href={orderHref(q, { page: q.page + 1 })}>Next</Link>}
        </span>
      </div>
    </div>
  )
}
