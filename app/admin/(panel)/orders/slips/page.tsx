import Link from 'next/link'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/guard'
import { formatPkt } from '@/lib/admin/dates'
import { formatPrice } from '@/lib/format'
import { parseSlipIds } from '@/lib/admin/order-list'
import { formatQuantity } from '@/lib/units/registry'
import PrintButton from '@/components/admin/PrintButton'

export const dynamic = 'force-dynamic'

/**
 * Packing slips for the ticked orders: one per page when printed. A slip says who the parcel is for, what goes in
 * it and how much cash the rider must collect. Only this store's own orders are ever loaded.
 */
export default async function PackingSlips({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const admin = await requireAdmin('orders.view')
  const ids = parseSlipIds((await searchParams).ids)
  const [orders, store, settings] = await Promise.all([
    ids.length ? db.order.findMany({
      where: { id: { in: ids }, storeId: admin.storeId },
      select: { id: true, number: true, placedAt: true, customerName: true, customerPhone: true, provinceName: true, cityName: true, localityName: true, landmark: true, customerNote: true, total: true, amountPaid: true, source: true,
        items: { select: { id: true, name: true, variantLabel: true, sku: true, quantity: true, unitCode: true } }, shipments: { select: { courier: true, courierTrackingNo: true }, take: 1 } },
    }) : [],
    db.store.findUnique({ where: { id: admin.storeId }, select: { name: true } }),
    db.storeSettings.findUnique({ where: { storeId: admin.storeId }, select: { supportPhone: true } }),
  ])
  const sorted = ids.map((id) => orders.find((o) => o.id === id)).filter((o): o is (typeof orders)[number] => !!o) // the order they were ticked in
  if (sorted.length === 0) return <div className="max-w-xl"><p className="rounded-xl border border-slate-200 bg-white p-5 text-sm">No orders to print. <Link className="underline" href="/admin/orders">Back to orders</Link></p></div>
  return (
    <div className="mx-auto max-w-2xl">
      <div className="print:hidden mb-4"><p className="text-sm text-slate-600">{sorted.length} packing slip{sorted.length === 1 ? '' : 's'}. Each prints on its own page.</p><PrintButton /></div>
      {sorted.map((o) => {
        const cod = Math.max(0, o.total.toNumber() - o.amountPaid.toNumber())
        return (
          <article key={o.id} className="mb-6 rounded-xl border border-slate-300 bg-white p-6 text-sm print:mb-0 print:rounded-none print:border-0 print:p-0 break-after-page">
            <header className="flex justify-between gap-4 border-b border-slate-300 pb-3">
              <div><p className="text-lg font-bold">{store?.name}</p>{settings?.supportPhone && <p>{settings.supportPhone}</p>}</div>
              <div className="text-right"><p className="text-lg font-bold">Order #{o.number}</p><p>{formatPkt(o.placedAt)}</p></div>
            </header>
            <section className="grid grid-cols-2 gap-4 py-3">
              <div>
                <p className="text-xs uppercase text-slate-500">Deliver to</p>
                <p className="font-semibold">{o.customerName}</p><p>{o.customerPhone}</p>
                <p>{[o.landmark, o.localityName].filter(Boolean).join(', ')}</p><p>{[o.cityName, o.provinceName].filter(Boolean).join(', ')}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase text-slate-500">Collect on delivery</p>
                <p className="text-xl font-bold">{cod > 0 ? formatPrice(cod) : 'Nothing: already paid'}</p>
                {o.shipments[0]?.courierTrackingNo && <p className="mt-1">Tracking no. <span className="font-mono">{o.shipments[0].courierTrackingNo}</span></p>}
              </div>
            </section>
            <table className="w-full border-t border-slate-300 text-left">
              <thead><tr className="text-xs uppercase text-slate-500"><th className="py-2">Item</th><th className="py-2">Code</th><th className="py-2 text-right">Quantity</th><th className="py-2 text-right w-16">Packed</th></tr></thead>
              <tbody>
                {o.items.map((i) => (
                  <tr key={i.id} className="border-t border-slate-200"><td className="py-2">{i.name}{i.variantLabel ? ` (${i.variantLabel})` : ''}</td><td className="py-2 font-mono text-xs">{i.sku}</td><td className="py-2 text-right font-semibold">{formatQuantity(i.quantity, i.unitCode)}</td><td className="py-2 text-right"><span className="inline-block h-4 w-4 border border-slate-500" aria-hidden /></td></tr>
                ))}
              </tbody>
            </table>
            {o.customerNote && <p className="mt-3 border-t border-slate-300 pt-2"><span className="text-xs uppercase text-slate-500">Customer note: </span>{o.customerNote}</p>}
          </article>
        )
      })}
    </div>
  )
}
