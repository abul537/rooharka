import { db } from '@/lib/db'
import { requirePlatform } from '@/lib/csmi/guard'
import { formatPkt } from '@/lib/admin/dates'
import { ERROR_KEEP_DAYS } from '@/lib/errors/rules'

export const dynamic = 'force-dynamic'

/** Pages that crashed, newest first: for the platform owner only. One row per distinct error per day, with a count. */
export default async function ErrorsPage() {
  await requirePlatform()
  const rows = await db.errorEvent.findMany({ orderBy: { lastAt: 'desc' }, take: 200 })
  const storeIds = [...new Set(rows.map((r) => r.storeId).filter((x): x is string => !!x))]
  const stores = storeIds.length ? await db.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } }) : []
  const nameOf = new Map(stores.map((s) => [s.id, s.name]))
  const today = rows.filter((r) => Date.now() - r.lastAt.getTime() < 86_400_000).reduce((n, r) => n + r.count, 0)
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Errors</h1>
        <p className="mt-1 text-sm text-slate-600">Pages that failed for a visitor or an owner. {today === 0 ? 'Nothing in the last 24 hours.' : `${today} in the last 24 hours.`} Kept for {ERROR_KEEP_DAYS} days. The full technical detail is in your hosting log; search it for the code shown.</p>
      </div>
      {rows.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No errors recorded. </p> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="p-3">Last seen</th><th className="p-3">Times</th><th className="p-3">Where</th><th className="p-3">Page</th><th className="p-3">What it said</th><th className="p-3">Store</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap p-3 text-slate-600">{formatPkt(r.lastAt)}</td>
                  <td className="p-3 font-semibold">{r.count}</td>
                  <td className="p-3">{r.kind === 'client' ? 'Browser' : 'Server'}</td>
                  <td className="p-3 font-mono text-xs">{r.path}</td>
                  <td className="p-3">{r.message}{r.digest && <span className="block font-mono text-xs text-slate-400">code {r.digest}</span>}</td>
                  <td className="p-3 text-slate-600">{r.storeId ? nameOf.get(r.storeId) ?? '(removed)' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
