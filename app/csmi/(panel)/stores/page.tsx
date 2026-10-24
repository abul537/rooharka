import Link from 'next/link'
import { requirePlatform } from '@/lib/csmi/guard'
import { canPlatform } from '@/lib/csmi/rules'
import { loadPlatform } from '@/lib/csmi/data'
import { formatPrice } from '@/lib/format'
import { formatPkt } from '@/lib/admin/dates'
import { Flags, Pill, pct } from '@/components/csmi/Pills'

export const dynamic = 'force-dynamic'
const STATUSES = ['ACTIVE', 'TRIAL', 'PAST_DUE', 'SUSPENDED', 'CANCELLED']

export default async function StoresPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const user = await requirePlatform()
  const { status, q } = await searchParams
  const p = await loadPlatform(30)
  const needle = (q ?? '').trim().toLowerCase().slice(0, 60)
  const rows = p.rows.filter((r) => (!status || r.status === status) && (!needle || `${r.name} ${r.slug} ${r.ownerName} ${r.ownerEmail}`.toLowerCase().includes(needle)))

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">Stores <span className="text-slate-400 font-normal text-lg">({rows.length})</span></h1>
        {canPlatform(user.role, 'csmi.manage') && <Link href="/csmi/stores/new" className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium">Add store</Link>}
      </div>
      <form className="flex flex-wrap gap-2 mb-4 text-sm">
        <input name="q" defaultValue={q ?? ''} placeholder="Search name, address, owner" className="rounded-lg border border-slate-300 px-3 py-2 min-w-64" />
        <select name="status" defaultValue={status ?? ''} className="rounded-lg border border-slate-300 px-3 py-2">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}
        </select>
        <button className="rounded-lg border border-slate-300 px-4 py-2">Filter</button>
      </form>

      <div className="overflow-x-auto rounded-xl bg-white border border-slate-200">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 border-b border-slate-200">
            <tr><th className="p-3">Store</th><th className="p-3">Plan</th><th className="p-3 text-right">Monthly</th><th className="p-3 text-right">Orders (30d)</th><th className="p-3 text-right">Sales (30d)</th><th className="p-3">Last order</th><th className="p-3">Health</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="p-3">
                  <Link href={`/csmi/stores/${r.id}`} className="font-medium hover:underline">{r.name}</Link> <Pill status={r.status} />
                  <div className="text-xs text-slate-500">{r.slug} · {r.ownerName}</div>
                </td>
                <td className="p-3">{r.planName ?? <span className="text-slate-400">none</span>}{r.subStatus && <div><Pill status={r.subStatus} /></div>}</td>
                <td className="p-3 text-right">{r.bucket === 'NONE' ? '-' : formatPrice(r.monthly)}{r.bucket === 'TRIAL' && <div className="text-xs text-slate-500">trial</div>}</td>
                <td className="p-3 text-right">{r.orders}<div className="text-xs text-slate-500">{pct(r.deliveredRate)} delivered</div></td>
                <td className="p-3 text-right">{formatPrice(r.gmv)}</td>
                <td className="p-3 whitespace-nowrap">{r.lastOrderAt ? formatPkt(r.lastOrderAt).split(',').slice(0, 2).join(',') : <span className="text-slate-400">never</span>}</td>
                <td className="p-3"><Flags flags={r.flags} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-500">No stores match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
