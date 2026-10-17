import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/guard'
import { getOverview } from '@/lib/admin/stats'
import { formatPrice } from '@/lib/format'
import { formatPkt } from '@/lib/admin/dates'
import StatusBadge from '@/components/admin/StatusBadge'

export const dynamic = 'force-dynamic'

export default async function Overview({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const admin = await requireAdmin()
  const { denied } = await searchParams
  const o = await getOverview(admin.storeId)

  const cards = [
    { t: 'Today', v: formatPrice(o.today.revenue), s: `${o.today.orders} orders` },
    { t: 'Last 7 days', v: formatPrice(o.week.revenue), s: `${o.week.orders} orders` },
    { t: 'Last 30 days', v: formatPrice(o.month.revenue), s: `${o.month.orders} orders` },
  ]
  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold mb-1">Welcome, {admin.name}</h1>
      <p className="text-slate-600 mb-6">Sales exclude cancelled and returned orders.</p>
      {denied && <p role="alert" className="mb-6 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">Your role does not have access to that page.</p>}

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        {cards.map((c) => (
          <div key={c.t} className="rounded-xl bg-white border border-slate-200 p-5">
            <p className="text-sm text-slate-500">{c.t}</p>
            <p className="text-2xl font-bold mt-1">{c.v}</p>
            <p className="text-sm text-slate-500">{c.s}</p>
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        <Link href="/admin/orders?status=PLACED" className="rounded-xl bg-white border border-slate-200 p-5 hover:border-slate-400">
          <p className="text-sm text-slate-500">New orders to confirm</p>
          <p className="text-3xl font-bold mt-1">{o.toConfirm}</p>
        </Link>
        <Link href="/admin/orders?pay=pending" className="rounded-xl bg-white border border-slate-200 p-5 hover:border-slate-400">
          <p className="text-sm text-slate-500">Advance payments waiting for your check</p>
          <p className="text-3xl font-bold mt-1">{o.pendingPayments}</p>
        </Link>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="rounded-xl bg-white border border-slate-200 p-5">
          <h2 className="font-semibold mb-3">Recent orders</h2>
          {o.recent.length === 0 ? <p className="text-sm text-slate-500">No orders yet.</p> : (
            <ul className="divide-y divide-slate-100">
              {o.recent.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/orders/${r.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50 -mx-2 px-2 rounded">
                    <span className="min-w-0">
                      <span className="font-medium">#{r.number}</span> <span className="text-slate-600 truncate">{r.customerName}</span>
                      <span className="block text-xs text-slate-500">{formatPkt(r.placedAt)}</span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-sm font-medium">{formatPrice(r.total.toNumber())}</span>
                      <StatusBadge status={r.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl bg-white border border-slate-200 p-5">
          <h2 className="font-semibold mb-3">Low stock (10 or fewer)</h2>
          {o.lowStock.length === 0 ? <p className="text-sm text-slate-500">All good.</p> : (
            <ul className="divide-y divide-slate-100">
              {o.lowStock.map((v) => (
                <li key={v.id} className="flex justify-between py-2.5 text-sm">
                  <span>{v.product.name} · {v.label}</span>
                  <span className={v.stock === 0 ? 'font-bold text-red-700' : 'font-medium text-amber-700'}>{v.stock === 0 ? 'Out of stock' : `${v.stock} left`}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
