import Link from 'next/link'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/guard'
import { can } from '@/lib/auth/permissions'
import { NEXT_STATUSES, label, type OrderStatus } from '@/lib/admin/order-rules'
import { STAGE_TODO, TRACK_ACTIVE, stageSince, TRACK_DONE, TRACK_PAGE_SIZE, isLate, trackHref, trackSearch, trackStage, waited, whatsappUpdate, type TrackStage } from '@/lib/admin/order-tracking'
import { formatPkt } from '@/lib/admin/dates'
import StatusBadge from '@/components/admin/StatusBadge'
import { VerificationBadge } from '@/components/admin/VerificationCard'
import { isHeld } from '@/lib/fraud/rules'
import TrackingActions from '@/components/admin/TrackingActions'
import { inputCls } from '@/components/admin/ui'

export const dynamic = 'force-dynamic'

const rs = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`
const pill = (on: boolean) => `shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium ${on ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`

/**
 * ORDER TRACKING: the owner's side of the customer's "Track order" page. Orders are grouped by the step they are
 * at; each one can be moved to its next step here, with a note, and that is exactly what the customer then sees.
 * Only the signed-in admin's own store.
 */
export default async function OrderTrackingPage({ searchParams }: { searchParams: Promise<{ stage?: string | string[]; q?: string | string[] }> }) {
  const admin = await requireAdmin('orders.view')
  const sp = await searchParams
  const stage = trackStage(sp.stage), q = trackSearch(sp.q)
  const canUpdate = can(admin.role, 'orders.update')
  const done = (TRACK_DONE as readonly string[]).includes(stage)

  const where = q
    ? { storeId: admin.storeId, OR: [{ number: { contains: q } }, { trackingCode: { contains: q.toUpperCase() } }, { customerName: { contains: q, mode: 'insensitive' as const } }, { customerPhone: { contains: q.replace(/[^\d+]/g, '') || q } }] }
    : { storeId: admin.storeId, status: stage }
  const [counts, orders, store] = await Promise.all([
    db.order.groupBy({ by: ['status'], where: { storeId: admin.storeId }, _count: { _all: true } }),
    db.order.findMany({
      where,
      // Work in progress: the order that has waited longest comes first. Finished orders: the newest first.
      orderBy: { updatedAt: done || q ? 'desc' : 'asc' }, take: TRACK_PAGE_SIZE,
      select: {
        id: true, number: true, trackingCode: true, status: true, paymentStatus: true, verificationStatus: true, customerName: true, customerPhone: true, cityName: true, total: true, amountDue: true, placedAt: true,
        payments: { where: { method: { not: 'COD' }, status: 'PENDING' }, select: { id: true }, take: 1 },
        shipments: { orderBy: { bookedAt: 'desc' }, take: 1, select: { courier: true, courierTrackingNo: true } },
        history: { where: { isPublic: true }, orderBy: { createdAt: 'desc' }, take: 6, select: { note: true, status: true, createdAt: true } },
        _count: { select: { items: true } },
      },
    }),
    db.storeSettings.findUnique({ where: { storeId: admin.storeId }, select: { displayName: true, orderTrackingEnabled: true } }),
  ])
  const byStatus = new Map((counts as { status: string; _count: { _all: number } }[]).map((c) => [c.status, c._count._all]))
  const total = q ? orders.length : byStatus.get(stage) ?? 0
  const now = new Date()
  const tab = (s: TrackStage) => <Link key={s} href={trackHref(s)} aria-current={!q && stage === s ? 'page' : undefined} className={pill(!q && stage === s)}>{label(s)}<span className="ml-1.5 opacity-70">{byStatus.get(s) ?? 0}</span></Link>

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Order tracking</h1>
        <p className="mt-1 text-slate-600">Move each order to its next step. Your customer sees the step, and any note you add, on the Track order page of your shop.</p>
      </div>
      {store && !store.orderTrackingEnabled && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Customers cannot see any of this right now: order tracking is switched off for your shop. <Link href="/admin/settings?tab=checkout" className="font-medium underline">Switch it on in Settings</Link>.</p>
      )}

      <div className="space-y-2">
        <nav aria-label="Orders in progress" className="flex gap-2 overflow-x-auto pb-1">{TRACK_ACTIVE.map(tab)}</nav>
        <nav aria-label="Finished orders" className="flex items-center gap-2 overflow-x-auto pb-1"><span className="shrink-0 text-xs text-slate-500">Finished:</span>{TRACK_DONE.map(tab)}</nav>
      </div>

      <form method="get" action="/admin/order-tracking" role="search" className="flex max-w-xl gap-2">
        <input name="q" defaultValue={q} maxLength={60} placeholder="Find an order: number, tracking code, name or phone" aria-label="Find an order" className={inputCls} />
        <button className="shrink-0 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white">Find</button>
        {q && <Link href={trackHref(stage)} className="shrink-0 self-center text-sm underline">Clear</Link>}
      </form>

      <p className="text-sm text-slate-600">
        {q ? <>Results for “{q}”{orders.length === TRACK_PAGE_SIZE && ` (first ${TRACK_PAGE_SIZE}; type more to narrow it down)`}.</> : <>{STAGE_TODO[stage]}{total > orders.length && ` Showing the ${orders.length} of ${total} that ${done ? 'changed most recently' : 'have waited longest'}.`}</>}
      </p>

      {orders.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{q ? 'No order matches. Check the number or code and try again.' : 'No orders at this step.'}</p>}
      <ul className="space-y-3">
        {orders.map((o) => {
          const last = o.history[0] ?? null
          const since = stageSince(o.status, o.history, o.placedAt)
          const late = isLate(o.status, since, now)
          const next = NEXT_STATUSES[o.status as OrderStatus].filter((s) => s !== 'CANCELLED')
          const ship = o.shipments[0] ?? null
          const wa = whatsappUpdate({ phone: o.customerPhone, name: o.customerName, number: o.number, status: o.status, trackingCode: o.trackingCode, note: last?.note, store: store?.displayName ?? 'our shop' })
          return (
            <li key={o.id} className={`rounded-xl border bg-white p-4 sm:p-5 ${late ? 'border-amber-300' : 'border-slate-200'}`}>
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/orders/${o.id}`} className="text-lg font-semibold underline-offset-2 hover:underline">#{o.number}</Link>
                    <StatusBadge status={o.status} /><StatusBadge status={o.paymentStatus} />{o.verificationStatus !== 'CLEAR' && <VerificationBadge status={o.verificationStatus} />}
                    {late && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">Waiting {waited(since, now)}</span>}
                  </div>
                  <p className="text-sm text-slate-700">{o.customerName} · {o.cityName} · <a href={`tel:${o.customerPhone}`} className="underline">{o.customerPhone}</a></p>
                  <p className="text-sm text-slate-600">{o._count.items} item{o._count.items === 1 ? '' : 's'} · {rs(o.total.toNumber())}{o.amountDue.toNumber() > 0 && <> · collect {rs(o.amountDue.toNumber())}</>} · placed {formatPkt(o.placedAt)}</p>
                  {ship && <p className="text-sm text-slate-600">Courier: <span className="font-medium capitalize">{ship.courier}</span>{ship.courierTrackingNo && <> · <span className="font-mono">{ship.courierTrackingNo}</span></>}</p>}
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">What the customer sees</p>
                    <p className="mt-0.5 font-medium text-slate-900">{label(o.status)}{last?.note && last.note !== label(o.status) && <span className="font-normal text-slate-700">: {last.note}</span>}</p>
                    <p className="text-xs text-slate-500">{!late && <>At this step for {waited(since, now)} · </>}Tracking code <span className="font-mono">{o.trackingCode}</span></p>
                  </div>
                </div>
                <div className="min-w-0 space-y-3">
                  {canUpdate && !(next.length === 0)
                    ? <TrackingActions orderId={o.id} number={o.number} next={next} blocked={isHeld(o) && o.status !== 'DELIVERED' ? 'Held by the fake-order check. Open the order, read the reasons, then approve or cancel it.' : o.payments.length > 0 ? 'The customer’s advance payment is waiting to be checked. Open the order to confirm or reject it first.' : null} />
                    : next.length === 0 ? <p className="text-sm text-slate-500">This order is finished; its step cannot change any more.</p> : <p className="text-sm text-slate-500">You can view orders but not change them.</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <Link href={`/admin/orders/${o.id}`} className="underline">Open order{NEXT_STATUSES[o.status as OrderStatus].includes('CANCELLED') ? ' (or cancel)' : ''}</Link>
                    {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">Tell the customer on WhatsApp</a>}
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
