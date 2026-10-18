import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/guard'
import { listProducts } from '@/lib/admin/products'
import { formatPrice } from '@/lib/format'
import StatusBadge from '@/components/admin/StatusBadge'

export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  const admin = await requireAdmin('products.view')
  const products = await listProducts(admin.storeId)
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-4">Products</h1>
      <div className="rounded-xl bg-white border border-slate-200 divide-y divide-slate-100">
        {products.length === 0 && <p className="p-6 text-slate-500 text-sm">No products yet.</p>}
        {products.map((p) => {
          const live = p.variants.filter((v) => v.isActive)
          const prices = live.map((v) => v.price.toNumber())
          const stock = live.filter((v) => v.trackStock).reduce((n, v) => n + v.stock, 0)
          return (
            <Link key={p.id} href={`/admin/products/${p.id}`} className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50">
              <span className="min-w-0">
                <span className="font-medium block truncate">{p.name}</span>
                <span className="text-sm text-slate-500">
                  {prices.length ? `${formatPrice(Math.min(...prices))}${Math.max(...prices) > Math.min(...prices) ? ` – ${formatPrice(Math.max(...prices))}` : ''}` : 'No active sizes'} · {stock} in stock
                </span>
              </span>
              <span className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${p.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{p.status.toLowerCase()}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
