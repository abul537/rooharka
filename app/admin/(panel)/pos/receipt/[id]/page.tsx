import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/guard'
import { formatPkt } from '@/lib/admin/dates'
import { formatPrice } from '@/lib/format'
import { POS_METHOD_LABEL, type PosPaymentMethod } from '@/lib/pos/rules'
import PrintButton from '@/components/admin/PrintButton'

export const dynamic = 'force-dynamic'

/** A narrow, print-friendly receipt (works on thermal printers and normal paper). Only this store's own counter sales open. */
export default async function Receipt({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin('pos.sell')
  const { id } = await params
  const [order, store, settings] = await Promise.all([
    db.order.findFirst({ where: { id, storeId: admin.storeId, source: 'POS' }, include: { items: true, payments: { take: 1 } } }),
    db.store.findUnique({ where: { id: admin.storeId }, select: { name: true } }),
    db.storeSettings.findUnique({ where: { storeId: admin.storeId }, select: { supportPhone: true } }),
  ])
  if (!order || !store) notFound()
  const pay = order.payments[0]
  const raw = (pay?.rawResponse ?? {}) as { tendered?: number | null; change?: number }
  return (
    <div className="mx-auto max-w-[320px] bg-white p-4 text-sm print:p-0 font-mono">
      <h1 className="text-center text-base font-bold">{store.name}</h1>
      {settings?.supportPhone && <p className="text-center">{settings.supportPhone}</p>}
      <p className="text-center mt-1">Receipt #{order.number}</p>
      <p className="text-center">{formatPkt(order.placedAt)}</p>
      {order.status === 'CANCELLED' && <p className="text-center font-bold my-2">CANCELLED</p>}
      <hr className="my-2 border-dashed" />
      {order.items.map((i) => (
        <div key={i.id} className="mb-1">
          <p>{i.name}{i.variantLabel ? ` (${i.variantLabel})` : ''}</p>
          <p className="flex justify-between"><span>{i.quantity} × {formatPrice(i.unitPrice.toNumber())}</span><span>{formatPrice(i.lineTotal.toNumber())}</span></p>
        </div>
      ))}
      <hr className="my-2 border-dashed" />
      <p className="flex justify-between"><span>Items</span><span>{formatPrice(order.subtotal.toNumber())}</span></p>
      {order.discount.toNumber() > 0 && <p className="flex justify-between"><span>Discount</span><span>− {formatPrice(order.discount.toNumber())}</span></p>}
      <p className="flex justify-between font-bold text-base"><span>Total</span><span>{formatPrice(order.total.toNumber())}</span></p>
      {pay && <p className="flex justify-between"><span>Paid by</span><span>{POS_METHOD_LABEL[pay.method as PosPaymentMethod] ?? pay.method}</span></p>}
      {pay?.method === 'CASH' && raw.tendered ? <><p className="flex justify-between"><span>Cash received</span><span>{formatPrice(raw.tendered)}</span></p><p className="flex justify-between"><span>Change</span><span>{formatPrice(raw.change ?? 0)}</span></p></> : null}
      {order.customerName !== 'Walk-in customer' && <p className="mt-2">Customer: {order.customerName}</p>}
      <p className="text-center mt-3">Thank you for shopping with us</p>
      <PrintButton />
    </div>
  )
}
