import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/guard'
import { getOverview } from '@/lib/admin/stats'
import { PERIODS, PERIOD_LABEL, PREVIOUS_LABEL, chartBars, parsePeriod, shortDay } from '@/lib/admin/insights'
import { formatPrice } from '@/lib/format'
import { formatPkt } from '@/lib/admin/dates'
import StatusBadge from '@/components/admin/StatusBadge'
import AutoRefresh from '@/components/admin/AutoRefresh'

export const dynamic = 'force-dynamic'

/** "▲ 12.5%" in green, "▼ 3%" in red, "new" when there was nothing to compare with. */
function Change({ value, vs }: { value: number | null; vs: string }) {
  if (value === null) return <span className="text-xs text-slate-500">no data for {vs}</span>
  if (value === 0) return <span className="text-xs text-slate-500">same as {vs}</span>
  return <span className={`text-xs font-medium ${value > 0 ? 'text-emerald-700' : 'text-red-700'}`}>{value > 0 ? '▲' : '▼'} {Math.abs(value)}% <span className="font-normal text-slate-500">vs {vs}</span></span>
}

export default async function Overview({ searchParams }: { searchParams: Promise<{ denied?: string; period?: string }> }) {
  const admin = await requireAdmin()
  const sp = await searchParams
  const period = parsePeriod(sp.period)
  const o = await getOverview(admin.storeId, period)
  const vs = PREVIOUS_LABEL[period]
  const W = 720, H = 180
  const { bars, top } = chartBars(o.series, W, H)
  const labelEvery = Math.max(1, Math.ceil(o.series.length / 8))

  const cards = [
    { t: 'Total sales', v: formatPrice(o.sales.value), c: o.sales.change, s: `Online ${formatPrice(o.online.sales)} · Counter ${formatPrice(o.counter.sales)}` },
    { t: 'Orders', v: String(o.orders.value), c: o.orders.change, s: `Online ${o.online.orders} · Counter ${o.counter.orders}` },
    { t: 'Average order value', v: formatPrice(o.averageOrder.value), c: o.averageOrder.change, s: 'Sales divided by orders' },
    { t: 'Conversion rate', v: o.conversion.value === null ? 'No visitors yet' : `${o.conversion.value}%`, c: o.conversion.change, s: `${o.visitors.value} visitor${o.visitors.value === 1 ? '' : 's'} · online orders per 100 visitors` },
  ]

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold">Welcome, {admin.name}</h1>
        <AutoRefresh seconds={30} />
      </div>
      <p className="text-slate-600 mb-5">Your shop at a glance. Sales exclude cancelled and returned orders; online and counter sales are counted together.</p>
      {sp.denied && <p role="alert" className="mb-6 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">Your role does not have access to that page.</p>}

      <nav aria-label="Period" className="flex flex-wrap gap-2 mb-5">
        {PERIODS.map((p) => <Link key={p} href={p === '7d' ? '/admin' : `/admin?period=${p}`} className={`rounded-full px-3 py-1 text-sm font-medium ${p === period ? 'bg-slate-900 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}`}>{PERIOD_LABEL[p]}</Link>)}
      </nav>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => (
          <div key={c.t} className="rounded-xl bg-white border border-slate-200 p-5">
            <p className="text-sm text-slate-500">{c.t}</p>
            <p className="text-2xl font-bold mt-1">{c.v}</p>
            <Change value={c.c} vs={vs} />
            <p className="text-xs text-slate-500 mt-2">{c.s}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[2fr_1fr] gap-6 mb-6">
        <section className="rounded-xl bg-white border border-slate-200 p-5">
          <h2 className="font-semibold">Sales by day <span className="font-normal text-sm text-slate-500">· {PERIOD_LABEL[period].toLowerCase()}</span></h2>
          <svg viewBox={`0 0 ${W} ${H + 28}`} className="mt-3 w-full h-auto" role="img" aria-label={`Sales by day, ${PERIOD_LABEL[period].toLowerCase()}. Highest bar: ${formatPrice(Math.max(0, ...o.series.map((p) => p.sales)))}.`}>
            {[0, 0.5, 1].map((f) => <line key={f} x1="0" x2={W} y1={H - f * H} y2={H - f * H} stroke="#e2e8f0" strokeWidth="1" />)}
            <text x="0" y="10" fontSize="10" fill="#64748b">{formatPrice(top)}</text>
            {bars.map((b, i) => (
              <g key={b.day}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="2" fill="#0f172a"><title>{`${shortDay(b.day)}: ${formatPrice(b.sales)} from ${b.orders} order${b.orders === 1 ? '' : 's'}`}</title></rect>
                {i % labelEvery === 0 && <text x={b.x + b.w / 2} y={H + 16} fontSize="10" fill="#64748b" textAnchor="middle">{shortDay(b.day)}</text>}
              </g>
            ))}
          </svg>
          {o.sales.value === 0 && <p className="text-sm text-slate-500 mt-2">No sales in this period yet.</p>}
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-slate-600">Show the numbers as a table</summary>
            <table className="mt-2 w-full text-left">
              <thead className="text-slate-500"><tr><th className="py-1 font-medium">Day</th><th className="py-1 font-medium">Orders</th><th className="py-1 font-medium">Sales</th></tr></thead>
              <tbody>{o.series.map((p) => <tr key={p.day} className="border-t border-slate-100"><td className="py-1">{shortDay(p.day)}</td><td className="py-1">{p.orders}</td><td className="py-1">{formatPrice(p.sales)}</td></tr>)}</tbody>
            </table>
          </details>
        </section>

        <div className="space-y-6">
          <section className="rounded-xl bg-white border border-slate-200 p-5">
            <h2 className="font-semibold">On your shop right now</h2>
            <p className="text-4xl font-bold mt-2">{o.live}</p>
            <p className="text-sm text-slate-500">visitor{o.live === 1 ? '' : 's'} in the last 5 minutes</p>
          </section>
          <section className="rounded-xl bg-white border border-slate-200 p-5">
            <h2 className="font-semibold mb-2">To do</h2>
            {o.tasks.length === 0 ? <p className="text-sm text-slate-500">Nothing waiting for you. Well done.</p> : (
              <ul className="space-y-2">
                {o.tasks.map((t) => (
                  <li key={t.key}><Link href={t.href} className={`block rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 ${t.urgent ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>{t.text} <span aria-hidden>→</span></Link></li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="rounded-xl bg-white border border-slate-200 p-5">
          <h2 className="font-semibold mb-3">Recent orders</h2>
          {o.recent.length === 0 ? <p className="text-sm text-slate-500">No orders yet.</p> : (
            <ul className="divide-y divide-slate-100">
              {o.recent.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/orders/${r.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50 -mx-2 px-2 rounded">
                    <span className="min-w-0">
                      <span className="font-medium">#{r.number}</span> <span className="text-slate-600 truncate">{r.customerName}</span>{r.source === 'POS' && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">counter</span>}
                      <span className="block text-xs text-slate-500">{formatPkt(r.placedAt)}</span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-sm font-medium">{formatPrice(r.total)}</span>
                      <StatusBadge status={r.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/orders" className="mt-3 inline-block text-sm underline">All orders</Link>
        </section>
        <section className="rounded-xl bg-white border border-slate-200 p-5">
          <h2 className="font-semibold mb-3">Best sellers <span className="font-normal text-sm text-slate-500">· {PERIOD_LABEL[period].toLowerCase()}</span></h2>
          {o.top.length === 0 ? <p className="text-sm text-slate-500">No sales in this period yet.</p> : (
            <ol className="divide-y divide-slate-100 text-sm">
              {o.top.map((t, i) => <li key={t.name} className="flex justify-between gap-3 py-2.5"><span className="min-w-0 truncate">{i + 1}. {t.name}</span><span className="shrink-0 font-medium">{formatPrice(t.sales)}</span></li>)}
            </ol>
          )}
        </section>
        <section className="rounded-xl bg-white border border-slate-200 p-5">
          <h2 className="font-semibold mb-3">Low stock (10 or fewer)</h2>
          {o.lowStock.length === 0 ? <p className="text-sm text-slate-500">All good.</p> : (
            <ul className="divide-y divide-slate-100">
              {o.lowStock.map((v) => (
                <li key={v.id}><Link href={`/admin/products/${v.product.id}`} className="flex justify-between gap-3 py-2.5 text-sm hover:bg-slate-50 -mx-2 px-2 rounded">
                  <span className="min-w-0 truncate">{v.product.name} · {v.label}</span>
                  <span className={`shrink-0 ${v.stock <= 0 ? 'font-bold text-red-700' : 'font-medium text-amber-700'}`}>{v.stock <= 0 ? 'Out of stock' : `${v.stock} left`}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
