import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/guard'
import { can } from '@/lib/auth/permissions'
import { db } from '@/lib/db'
import { formatPrice } from '@/lib/format'
import { formatPkt } from '@/lib/admin/dates'
import { NEXT_STATUSES, label, type OrderStatus } from '@/lib/admin/order-rules'
import StatusBadge from '@/components/admin/StatusBadge'
import ActionForm from '@/components/admin/ActionForm'
import { courierName, courierOptions, trackingLink } from '@/lib/couriers/config'
import { loadCourierSetup } from '@/lib/couriers/store'
import { bookCourierAction, cancelAction, paymentAction, shipmentAction, statusAction } from './actions'

export const dynamic = 'force-dynamic'
const btn = 'rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50'

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin('orders.view')
  const { id } = await params
  const setupPromise = loadCourierSetup(admin.storeId)
  // Scoped by storeId: another store's order id simply "does not exist".
  const order = await db.order.findFirst({
    where: { id, storeId: admin.storeId },
    include: {
      items: true, payments: { orderBy: { createdAt: 'asc' } }, shipments: true,
      history: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!order) notFound()
  const { config: courierConfig, connected } = await setupPromise
  const couriers = courierOptions(courierConfig, connected)

  const canUpdate = can(admin.role, 'orders.update')
  const canCancel = can(admin.role, 'orders.cancel')
  const canPay = can(admin.role, 'payments.confirm')
  const pending = order.payments.filter((p) => p.method !== 'COD' && p.status === 'PENDING')
  const next = NEXT_STATUSES[order.status as OrderStatus].filter((s) => s !== 'CANCELLED')
  const canShip = canUpdate && (order.status === 'PACKED' || order.status === 'SHIPPED') && pending.length === 0

  return (
    <div className="max-w-5xl">
      <Link href="/admin/orders" className="text-sm text-slate-600 underline">← All orders</Link>
      <div className="flex flex-wrap items-center gap-3 mt-2 mb-6">
        <h1 className="text-2xl font-bold">Order #{order.number}</h1>
        <StatusBadge status={order.status} /><StatusBadge status={order.paymentStatus} />
        <span className="text-sm text-slate-500">{formatPkt(order.placedAt)} · Tracking {order.trackingCode}</span>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-xl bg-white border border-slate-200 p-5">
            <h2 className="font-semibold mb-3">Items</h2>
            <ul className="divide-y divide-slate-100 text-sm">
              {order.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 py-2">
                  <span>{i.name}{i.variantLabel ? ` · ${i.variantLabel}` : ''} <span className="text-slate-500">× {i.quantity}</span></span>
                  <span>{formatPrice(i.lineTotal.toNumber())}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 pt-3 border-t border-slate-200 text-sm space-y-1">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatPrice(order.subtotal.toNumber())}</dd></div>
              <div className="flex justify-between"><dt>Delivery</dt><dd>{formatPrice(order.deliveryCharge.toNumber())}</dd></div>
              <div className="flex justify-between font-bold"><dt>Total</dt><dd>{formatPrice(order.total.toNumber())}</dd></div>
              <div className="flex justify-between"><dt>Paid</dt><dd>{formatPrice(order.amountPaid.toNumber())}</dd></div>
              <div className="flex justify-between font-medium"><dt>Collect on delivery</dt><dd>{formatPrice(order.total.toNumber() - order.amountPaid.toNumber())}</dd></div>
            </dl>
          </section>

          <section className="rounded-xl bg-white border border-slate-200 p-5">
            <h2 className="font-semibold mb-3">Payments</h2>
            {order.payments.length === 0 && <p className="text-sm text-slate-500">No payments recorded.</p>}
            <ul className="space-y-3">
              {order.payments.map((p) => (
                <li key={p.id} className="text-sm rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{p.method} · {formatPrice(p.amount.toNumber())}</span>
                    <span className="text-slate-600 capitalize">{p.status.toLowerCase()}</span>
                  </div>
                  {p.providerRef && <p className="text-slate-600">Transaction ID: <span className="font-mono">{p.providerRef}</span></p>}
                  {canPay && p.method !== 'COD' && p.status === 'PENDING' && order.status !== 'CANCELLED' && (
                    <div className="mt-2 flex gap-2">
                      {(['confirm', 'reject'] as const).map((d) => (
                        <ActionForm key={d} action={paymentAction} confirm={d === 'reject' ? 'Reject this payment?' : undefined}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <input type="hidden" name="paymentId" value={p.id} />
                          <input type="hidden" name="decision" value={d} />
                          <button className={`${btn} ${d === 'confirm' ? 'bg-emerald-600 text-white' : 'border border-slate-300'}`}>
                            {d === 'confirm' ? 'I received this money' : 'Not received'}
                          </button>
                        </ActionForm>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl bg-white border border-slate-200 p-5">
            <h2 className="font-semibold mb-3">Shipments</h2>
            {order.shipments.map((s) => {
              const link = trackingLink(courierConfig, s.courier, s.courierTrackingNo)
              return (
                <p key={s.id} className="text-sm mb-1">
                  {courierName(courierConfig, s.courier)} · <span className="font-mono">{s.courierTrackingNo}</span>
                  {link && <a href={link} target="_blank" rel="noopener noreferrer" className="ml-2 underline text-slate-600">Track on courier site</a>}
                </p>
              )
            })}
            {order.shipments.length === 0 && <p className="text-sm text-slate-500 mb-2">Not shipped yet.</p>}
            {canShip && couriers.length === 0 && (
              <p className="text-sm text-amber-700">No courier is switched on. Turn one on in Settings, then Couriers.</p>
            )}
            {canShip && couriers.length > 0 && order.shipments.length === 0 && couriers.some((c) => c.auto) && (
              <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-3">
                <p className="text-sm font-medium mb-2">Book automatically (uses your own courier account)</p>
                <div className="flex flex-wrap gap-2">
                  {couriers.filter((c) => c.auto).map((c) => (
                    <ActionForm key={c.key} action={bookCourierAction} confirm={`Book this parcel with ${c.name} now? Cash to collect: ${formatPrice(order.total.toNumber() - order.amountPaid.toNumber())}.`}>
                      <input type="hidden" name="orderId" value={order.id} />
                      <input type="hidden" name="courier" value={c.key} />
                      <button className={`${btn} bg-emerald-700 text-white`}>Book with {c.name}</button>
                    </ActionForm>
                  ))}
                </div>
              </div>
            )}
            {canShip && couriers.length > 0 && (
              <ActionForm action={shipmentAction} className="mt-3 flex flex-wrap gap-2 items-start">
                <input type="hidden" name="orderId" value={order.id} />
                <select name="courier" required defaultValue={couriers[0].key} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" aria-label="Courier">
                  {couriers.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                </select>
                <input name="trackingNo" required placeholder="Tracking number (booked on the courier’s site)" maxLength={40} className="rounded-lg border border-slate-300 px-3 py-2 text-sm min-w-64" />
                <button className={`${btn} bg-slate-900 text-white`}>Add shipment</button>
              </ActionForm>
            )}
          </section>

          <section className="rounded-xl bg-white border border-slate-200 p-5">
            <h2 className="font-semibold mb-3">History</h2>
            <ul className="space-y-2 text-sm">
              {order.history.map((h) => (
                <li key={h.id}>
                  <span className="text-slate-500">{formatPkt(h.createdAt)}</span> · {h.note ?? label(h.status)}
                  {!h.isPublic && <span className="ml-2 text-xs rounded bg-amber-100 text-amber-800 px-1.5">private</span>}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-xl bg-white border border-slate-200 p-5 text-sm">
            <h2 className="font-semibold mb-3">Customer</h2>
            <p className="font-medium">{order.customerName}</p>
            <p><a className="underline" href={`tel:${order.customerPhone}`}>{order.customerPhone}</a></p>
            {order.customerEmail && <p>{order.customerEmail}</p>}
            <p className="mt-3 text-slate-700">{order.localityName}, {order.cityName}, {order.provinceName}{order.postalCode ? ` ${order.postalCode}` : ''}</p>
            {order.landmark && <p className="text-slate-600">Near: {order.landmark}</p>}
            {order.customerNote && <p className="mt-3 rounded bg-slate-50 p-2">Note: {order.customerNote}</p>}
            {can(admin.role, 'customers.view') && <Link className="mt-3 inline-block underline" href={`/admin/customers/${order.customerId}`}>View customer</Link>}
          </section>

          {canUpdate && next.length > 0 && (
            <section className="rounded-xl bg-white border border-slate-200 p-5">
              <h2 className="font-semibold mb-3">Update status</h2>
              {pending.length > 0 && <p className="mb-3 text-sm text-amber-800">Check the advance payment first.</p>}
              <div className="space-y-2">
                {next.map((s) => (
                  <ActionForm key={s} action={statusAction} confirm={s === 'RETURNED' ? 'Mark this order as returned?' : undefined}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="to" value={s} />
                    <button disabled={pending.length > 0} className={`${btn} w-full bg-slate-900 text-white`}>Mark {label(s).toLowerCase()}</button>
                  </ActionForm>
                ))}
              </div>
            </section>
          )}

          {canCancel && NEXT_STATUSES[order.status as OrderStatus].includes('CANCELLED') && (
            <section className="rounded-xl bg-white border border-red-200 p-5">
              <h2 className="font-semibold mb-3 text-red-800">Cancel order</h2>
              <ActionForm action={cancelAction} confirm="Cancel this order? Stock will be restored.">
                <input type="hidden" name="orderId" value={order.id} />
                <input name="reason" placeholder="Reason (shown to customer)" maxLength={300} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-2" />
                <button className={`${btn} w-full bg-red-600 text-white`}>Cancel order</button>
              </ActionForm>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
