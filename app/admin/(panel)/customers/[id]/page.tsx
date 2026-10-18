import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/guard'
import { can } from '@/lib/auth/permissions'
import { getCustomer } from '@/lib/admin/customers'
import { formatPrice } from '@/lib/format'
import { formatPkt } from '@/lib/admin/dates'
import StatusBadge from '@/components/admin/StatusBadge'
import ActionForm from '@/components/admin/ActionForm'
import { Card, inputCls, primaryBtn } from '@/components/admin/ui'
import { blockAction, notesAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin('customers.view')
  const { id } = await params
  const c = await getCustomer(admin.storeId, id) // scoped to this store
  if (!c) notFound()
  const canManage = can(admin.role, 'customers.block')

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/admin/customers" className="text-sm text-slate-600 underline">← All customers</Link>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold">{[c.firstName, c.lastName].filter(Boolean).join(' ')}</h1>
          {c.blocked && <span className="rounded-full bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5">Blocked</span>}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {[['Orders', String(c.ordersCount)], ['Total spent', formatPrice(c.totalSpent.toNumber())], ['Customer since', formatPkt(c.firstSeenAt).split(',')[0]]].map(([t, v]) => (
          <div key={t} className="rounded-xl bg-white border border-slate-200 p-4"><p className="text-sm text-slate-500">{t}</p><p className="text-xl font-bold">{v}</p></div>
        ))}
      </div>

      <Card title="Contact">
        <p className="text-sm"><a className="underline" href={`tel:${c.phone}`}>{c.phone}</a>{c.email && <> · {c.email}</>}</p>
        <h3 className="font-medium text-sm mt-4 mb-2">Addresses used</h3>
        <ul className="text-sm space-y-1 text-slate-700">
          {c.addresses.length === 0 && <li className="text-slate-500">None yet.</li>}
          {c.addresses.map((a) => <li key={a.id}>{a.locality.name}, {a.city.name}, {a.province.name}{a.landmark ? ` · ${a.landmark}` : ''}</li>)}
        </ul>
      </Card>

      <Card title="Order history">
        {c.orders.length === 0 ? <p className="text-sm text-slate-500">No orders.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {c.orders.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/orders/${o.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50">
                  <span>#{o.number} <span className="text-slate-500">· {formatPkt(o.placedAt)}</span></span>
                  <span className="flex items-center gap-3"><span>{formatPrice(o.total.toNumber())}</span><StatusBadge status={o.status} /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-500 mt-3">Site visit history will appear here once visitor tracking is switched on.</p>
      </Card>

      {canManage && (
        <>
          <Card title="Private notes" hint="Only your team sees these.">
            <ActionForm action={notesAction} className="space-y-3">
              <input type="hidden" name="customerId" value={c.id} />
              <textarea name="notes" defaultValue={c.notes ?? ''} rows={3} maxLength={1000} className={inputCls} />
              <button className={primaryBtn}>Save notes</button>
            </ActionForm>
          </Card>
          <Card title={c.blocked ? 'This number is blocked' : 'Block this number'} hint="Use for fake or abusive orders. A blocked number cannot place new orders.">
            <ActionForm action={blockAction} confirm={c.blocked ? undefined : 'Block this phone number from ordering?'} className="space-y-3">
              <input type="hidden" name="customerId" value={c.id} />
              <input type="hidden" name="block" value={c.blocked ? '0' : '1'} />
              {c.blocked ? <p className="text-sm text-slate-600">Reason: {c.blocked.reason ?? 'none given'}</p>
                : <input name="reason" maxLength={200} placeholder="Reason (private)" className={inputCls} />}
              <button className={`rounded-lg px-5 py-2 text-sm font-medium ${c.blocked ? 'border border-slate-300' : 'bg-red-600 text-white'}`}>{c.blocked ? 'Allow ordering again' : 'Block'}</button>
            </ActionForm>
          </Card>
        </>
      )}
    </div>
  )
}
