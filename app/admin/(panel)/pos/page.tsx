import Link from 'next/link'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/guard'
import { can } from '@/lib/auth/permissions'
import { loadPosAccess } from '@/lib/entitlements/service'
import { startOfPktDay, formatPkt } from '@/lib/admin/dates'
import { formatPrice } from '@/lib/format'
import { POS_METHOD_LABEL, tillFromPayments, type PosPaymentMethod } from '@/lib/pos/rules'
import ActionForm from '@/components/admin/ActionForm'
import { Card } from '@/components/admin/ui'
import PosSale, { type PosVariant } from '@/components/admin/PosSale'
import { voidSaleAction } from './actions'

export const dynamic = 'force-dynamic'
const MAX_ITEMS = 600

export default async function PosPage() {
  const admin = await requireAdmin('pos.sell')
  const access = await loadPosAccess(admin.storeId)
  if (!access.enabled) {
    return (
      <div className="max-w-2xl"><h1 className="text-2xl font-bold mb-2">POS (counter sale)</h1>
        <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm">POS lite is not switched on for your shop. It is part of some plans; ask the platform owner to switch it on for you.</p>
      </div>
    )
  }
  const today = startOfPktDay()
  const [variants, sales] = await Promise.all([
    db.productVariant.findMany({
      where: { isActive: true, product: { storeId: admin.storeId, status: 'ACTIVE' } },
      orderBy: [{ product: { name: 'asc' } }, { sortOrder: 'asc' }], take: MAX_ITEMS,
      select: { id: true, label: true, sku: true, barcode: true, price: true, stock: true, trackStock: true, allowBackorder: true, product: { select: { name: true, type: true, unitCode: true, qtyMin: true, qtyStep: true } } },
    }),
    db.order.findMany({
      where: { storeId: admin.storeId, source: 'POS', placedAt: { gte: today } }, orderBy: { placedAt: 'desc' }, take: 100,
      select: { id: true, number: true, total: true, status: true, placedAt: true, customerName: true, payments: { select: { method: true, amount: true }, orderBy: { createdAt: 'asc' } } },
    }),
  ])
  const items: PosVariant[] = variants.map((v) => ({ id: v.id, name: v.product.name, label: v.label, sku: v.sku, barcode: v.barcode, price: v.price.toNumber(), stock: v.trackStock && !v.allowBackorder ? v.stock : null, type: v.product.type, unitCode: v.product.unitCode, qtyMin: v.product.qtyMin, qtyStep: v.product.qtyStep }))
  const till = tillFromPayments(sales.map((s) => ({ cancelled: s.status === 'CANCELLED', payments: s.payments.map((p) => ({ method: p.method, amount: p.amount.toNumber() })) })))
  const canVoid = can(admin.role, 'orders.cancel')

  return (
    <div className="max-w-6xl space-y-6">
      <h1 className="text-2xl font-bold">POS (counter sale)</h1>
      <PosSale items={items} truncated={variants.length >= MAX_ITEMS} />

      <Card title="Today's takings" hint="Money you took at the counter today (Pakistan time). Cancelled sales are not counted. Amounts are what you recorded; nothing is charged from this screen.">
        <p className="text-sm mb-3"><strong>{formatPrice(till.total)}</strong> from {till.count} sale{till.count === 1 ? '' : 's'}</p>
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-700">{till.byMethod.map((m) => <li key={m.method}>{POS_METHOD_LABEL[m.method as PosPaymentMethod]}: <strong>{formatPrice(m.total)}</strong> ({m.count})</li>)}</ul>
        {sales.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {sales.map((s) => (
              <li key={s.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span>#{s.number} · {formatPkt(s.placedAt).split(',').slice(-1)[0].trim()} · {s.customerName} · {formatPrice(s.total.toNumber())}{s.status === 'CANCELLED' && <span className="ml-2 text-xs text-red-700">cancelled</span>}</span>
                <span className="flex items-center gap-3">
                  <Link className="underline" href={`/admin/pos/receipt/${s.id}`} target="_blank">Receipt</Link>
                  {canVoid && s.status !== 'CANCELLED' && (
                    <ActionForm action={voidSaleAction} confirm={`Cancel sale #${s.number}? The items go back in stock and you must hand the money back.`} className="flex items-center gap-2">
                      <input type="hidden" name="orderId" value={s.id} />
                      <input name="reason" maxLength={200} placeholder="Reason" aria-label={`Reason for cancelling #${s.number}`} className="rounded border border-slate-300 px-2 py-1 text-xs w-32" />
                      <button className="underline text-red-700">Cancel sale</button>
                    </ActionForm>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
