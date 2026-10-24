import Link from 'next/link'
import { requirePlatform } from '@/lib/csmi/guard'
import { loadPlatform } from '@/lib/csmi/data'
import { formatPrice } from '@/lib/format'
import { Flags, Pill, Stat, pct } from '@/components/csmi/Pills'

export const dynamic = 'force-dynamic'
const WINDOWS = [7, 30, 90]

export default async function CsmiOverview({ searchParams }: { searchParams: Promise<{ denied?: string; days?: string }> }) {
  const user = await requirePlatform()
  const sp = await searchParams
  const days = WINDOWS.includes(Number(sp.days)) ? Number(sp.days) : 30
  const p = await loadPlatform(days)

  const attention = p.rows.filter((r) => r.flags.length > 0)
    .sort((a, b) => b.flags.filter((f) => f.level === 'critical').length - a.flags.filter((f) => f.level === 'critical').length || b.flags.length - a.flags.length)
    .slice(0, 10)
  const top = [...p.rows].sort((a, b) => b.gmv - a.gmv).filter((r) => r.orders > 0).slice(0, 5)
  const failing = p.services.reduce((n, s) => n + s.failing, 0)

  return (
    <div className="max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Welcome, {user.name}</h1>
          <p className="text-slate-600">Recurring revenue counts only active stores with an active subscription.</p>
        </div>
        <nav aria-label="Period" className="flex gap-1 text-sm">
          {WINDOWS.map((w) => (
            <Link key={w} href={`/csmi?days=${w}`} className={`rounded-lg px-3 py-1.5 border ${w === days ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300'}`}>{w} days</Link>
          ))}
        </nav>
      </div>
      {sp.denied && <p role="alert" className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">Your role can look at this dashboard but not change it.</p>}

      <section aria-label="Money" className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat title="Monthly recurring revenue" value={formatPrice(p.revenue.mrr)} sub={`${p.revenue.payingStores} paying store${p.revenue.payingStores === 1 ? '' : 's'}`} />
        <Stat title="Yearly (12 x monthly)" value={formatPrice(p.revenue.arr)} />
        <Stat title="Profit each month" value={formatPrice(p.profit.profit)} tone={p.profit.profit < 0 ? 'bad' : 'good'}
          sub={p.profit.marginPct === null ? `after ${formatPrice(p.costs.total)} costs` : `${p.profit.marginPct}% margin, after ${formatPrice(p.costs.total)} costs`} />
        <Stat title="Collected this month" value={formatPrice(p.collectedThisMonth)} sub={`${formatPrice(p.outstanding)} still unpaid`} />
        <Stat title="At risk (past due)" value={formatPrice(p.revenue.atRisk)} tone={p.revenue.atRisk > 0 ? 'bad' : undefined} sub={`${formatPrice(p.overdueAmount)} overdue`} />
        <Stat title="In trial (not counted)" value={formatPrice(p.revenue.trial)} sub={`${p.statusCounts.TRIAL} trial store${p.statusCounts.TRIAL === 1 ? '' : 's'}`} />
        <Stat title={`Orders, last ${days} days`} value={p.windowOrders.toLocaleString('en-PK')} sub="across all stores" />
        <Stat title={`Sales, last ${days} days`} value={formatPrice(p.windowGmv)} sub="excludes cancelled and returned" />
      </section>

      <section aria-label="Stores by status" className="flex flex-wrap gap-2 text-sm">
        {(['ACTIVE', 'TRIAL', 'PAST_DUE', 'SUSPENDED', 'CANCELLED'] as const).map((s) => (
          <Link key={s} href={`/csmi/stores?status=${s}`} className="rounded-lg bg-white border border-slate-200 px-3 py-2 hover:border-slate-400 flex items-center gap-2">
            <Pill status={s} /> <span className="font-semibold">{p.statusCounts[s]}</span>
          </Link>
        ))}
        {failing > 0 && <Link href="/csmi/services" className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-3 py-2">{failing} failing integration{failing === 1 ? '' : 's'}</Link>}
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="rounded-xl bg-white border border-slate-200 p-5">
          <h2 className="font-semibold mb-3">Needs your attention</h2>
          {attention.length === 0 ? <p className="text-sm text-slate-500">Nothing needs attention. All stores look healthy.</p> : (
            <ul className="divide-y divide-slate-100">
              {attention.map((r) => (
                <li key={r.id} className="py-3">
                  <Link href={`/csmi/stores/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                  <div className="mt-1"><Flags flags={r.flags} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl bg-white border border-slate-200 p-5">
          <h2 className="font-semibold mb-3">Top stores by sales ({days} days)</h2>
          {top.length === 0 ? <p className="text-sm text-slate-500">No orders in this period yet.</p> : (
            <ol className="divide-y divide-slate-100">
              {top.map((r, i) => (
                <li key={r.id} className="py-2.5 flex items-center justify-between gap-3">
                  <Link href={`/csmi/stores/${r.id}`} className="hover:underline"><span className="text-slate-400 mr-2">{i + 1}</span>{r.name}</Link>
                  <span className="text-sm text-right"><span className="font-medium">{formatPrice(r.gmv)}</span> <span className="text-slate-500">· {r.orders} orders · {pct(r.deliveredRate)} delivered</span></span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}
