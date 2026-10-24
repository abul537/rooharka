import Link from 'next/link'
import { requirePlatform } from '@/lib/csmi/guard'
import { loadPlatform } from '@/lib/csmi/data'
import { formatPrice } from '@/lib/format'
import { Pill, pct } from '@/components/csmi/Pills'

export const dynamic = 'force-dynamic'
const WINDOWS = [7, 30, 90]

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requirePlatform()
  const { days: d } = await searchParams
  const days = WINDOWS.includes(Number(d)) ? Number(d) : 30
  const p = await loadPlatform(days)

  return (
    <div className="max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Store reports</h1>
        <div className="flex items-center gap-3 text-sm">
          <nav aria-label="Period" className="flex gap-1">
            {WINDOWS.map((w) => <Link key={w} href={`/csmi/reports?days=${w}`} className={`rounded-lg px-3 py-1.5 border ${w === days ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300'}`}>{w} days</Link>)}
          </nav>
          <a href={`/csmi/reports/export?days=${days}`} className="rounded-lg border border-slate-300 px-3 py-1.5">Download CSV</a>
        </div>
      </div>
      <p className="text-sm text-slate-600">One row per store for the last {days} days. Sales exclude cancelled and returned orders. Revenue and profit are monthly figures.</p>
      <div className="overflow-x-auto rounded-xl bg-white border border-slate-200">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 border-b border-slate-200">
            <tr><th className="p-3">Store</th><th className="p-3 text-right">Orders</th><th className="p-3 text-right">Sales</th><th className="p-3 text-right">Delivered</th><th className="p-3 text-right">Cancelled</th><th className="p-3 text-right">Returned</th><th className="p-3 text-right">Phone codes</th><th className="p-3 text-right">Revenue</th><th className="p-3 text-right">Cost</th><th className="p-3 text-right">Profit</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {p.rows.map((r) => (
              <tr key={r.id}>
                <td className="p-3"><Link href={`/csmi/stores/${r.id}`} className="font-medium hover:underline">{r.name}</Link> <Pill status={r.status} /></td>
                <td className="p-3 text-right">{r.orders}</td>
                <td className="p-3 text-right">{formatPrice(r.gmv)}</td>
                <td className="p-3 text-right">{r.delivered} <span className="text-slate-500">({pct(r.deliveredRate)})</span></td>
                <td className="p-3 text-right">{r.cancelled}</td>
                <td className="p-3 text-right">{r.returned}</td>
                <td className="p-3 text-right">{r.otpVerified}/{r.otpSent}</td>
                <td className="p-3 text-right">{r.bucket === 'MRR' ? formatPrice(r.monthly) : '-'}</td>
                <td className="p-3 text-right">{formatPrice(r.cost)}</td>
                <td className={`p-3 text-right font-medium ${r.profit.profit < 0 ? 'text-red-700' : ''}`}>{formatPrice(r.profit.profit)}</td>
              </tr>
            ))}
            <tr className="font-semibold bg-slate-50">
              <td className="p-3">All stores</td><td className="p-3 text-right">{p.windowOrders}</td><td className="p-3 text-right">{formatPrice(p.windowGmv)}</td>
              <td colSpan={4} />
              <td className="p-3 text-right">{formatPrice(p.revenue.mrr)}</td><td className="p-3 text-right">{formatPrice(p.costs.total)}</td><td className="p-3 text-right">{formatPrice(p.profit.profit)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Phone codes shows verified / sent. Per-store profit counts revenue only for stores that count toward recurring revenue; shared costs are split equally across live stores.</p>
    </div>
  )
}
