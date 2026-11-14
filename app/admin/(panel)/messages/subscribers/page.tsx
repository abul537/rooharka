import Link from 'next/link'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/guard'
import { formatPkt } from '@/lib/admin/dates'

export const dynamic = 'force-dynamic'

/** Email addresses customers left in the shop's Newsletter section. Only this store's own list. */
export default async function Subscribers() {
  const admin = await requireAdmin('orders.view')
  const [total, rows] = await Promise.all([
    db.newsletterSubscriber.count({ where: { storeId: admin.storeId } }),
    db.newsletterSubscriber.findMany({ where: { storeId: admin.storeId }, orderBy: { createdAt: 'desc' }, take: 1000, select: { id: true, email: true, createdAt: true } }),
  ])
  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link href="/admin/messages" className="text-sm text-slate-600 underline">← Messages</Link>
        <h1 className="text-2xl font-bold mt-2">Subscribers</h1>
        <p className="text-slate-600 text-sm mt-1">{total} {total === 1 ? 'person has' : 'people have'} asked to hear from your shop through the Newsletter section. Only write to them about your shop, and stop if they ask you to.</p>
      </div>
      {rows.length > 0 && (
        <label className="block text-sm"><span className="font-medium">All addresses (copy and paste into your email program’s BCC box)</span>
          <textarea readOnly rows={4} value={rows.map((r) => r.email).join(', ')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 font-mono text-xs" />
        </label>
      )}
      <div className="rounded-xl bg-white border border-slate-200 divide-y divide-slate-100">
        {rows.length === 0 && <p className="p-6 text-sm text-slate-500">Nobody yet. Add a “Newsletter / call to action” section to your home page and tick “Ask for the customer’s email”.</p>}
        {rows.map((r) => <p key={r.id} className="flex justify-between gap-3 px-4 py-2.5 text-sm"><span className="font-mono">{r.email}</span><span className="text-slate-500">{formatPkt(r.createdAt)}</span></p>)}
      </div>
    </div>
  )
}
