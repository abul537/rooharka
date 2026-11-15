import { db } from '@/lib/db'
import { formatPkt } from '@/lib/admin/dates'
import { STOCK_REASONS, signed, type StockReason } from '@/lib/stock-log'
import { formatQuantity } from '@/lib/units/registry'
import { Card } from '@/components/admin/ui'

/** The last 40 changes of this product's stock: when, which variant, how much, why and who. Only this store's lines. */
export default async function StockHistory({ storeId, productId, unitCode, variants }: { storeId: string; productId: string; unitCode: string | null; variants: { id: string; label: string }[] }) {
  const rows = await db.stockMovement.findMany({ where: { storeId, productId }, orderBy: { createdAt: 'desc' }, take: 40 }).catch(() => [])
  const users = rows.some((r) => r.userId) ? await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))] }, storeId }, select: { id: true, name: true } }) : []
  const who = new Map(users.map((u) => [u.id, u.name])), label = new Map(variants.map((v) => [v.id, v.label]))
  const amount = (n: number) => (unitCode ? `${n > 0 ? '+' : '-'}${formatQuantity(Math.abs(n), unitCode)}` : signed(n))
  return (
    <Card title="Stock history" hint="Every change of this product’s stock, newest first: orders, cancellations, counter sales and changes made by hand.">
      {rows.length === 0 ? <p className="text-sm text-slate-500">No changes recorded yet. Changes are recorded from now on.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th className="py-1.5 pr-3 font-medium">When</th><th className="py-1.5 pr-3 font-medium">Variant</th><th className="py-1.5 pr-3 font-medium">Change</th><th className="py-1.5 pr-3 font-medium">Why</th><th className="py-1.5 font-medium">By</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-slate-600">{formatPkt(r.createdAt)}</td>
                  <td className="py-1.5 pr-3">{label.get(r.variantId) ?? '(removed)'}</td>
                  <td className={`py-1.5 pr-3 font-semibold ${r.delta > 0 ? 'text-emerald-700' : 'text-red-700'}`}>{amount(r.delta)}</td>
                  <td className="py-1.5 pr-3">{STOCK_REASONS[r.reason as StockReason] ?? r.reason}{r.note && <span className="text-slate-500"> · {r.note}</span>}{r.orderId && <> · <a href={`/admin/orders/${r.orderId}`} className="underline">open</a></>}</td>
                  <td className="py-1.5 text-slate-600">{r.userId ? who.get(r.userId) ?? 'Staff' : 'Customer'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
