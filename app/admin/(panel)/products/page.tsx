import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/guard'
import { can } from '@/lib/auth/permissions'
import { listProducts } from '@/lib/admin/products'
import { formatPrice } from '@/lib/format'
import { imageVariant } from '@/lib/media/urls'

export const dynamic = 'force-dynamic'

const TONE: Record<string, string> = { ACTIVE: 'bg-emerald-100 text-emerald-800', DRAFT: 'bg-amber-100 text-amber-800', ARCHIVED: 'bg-slate-200 text-slate-700' }

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const admin = await requireAdmin('products.view')
  const { deleted } = await searchParams
  const products = await listProducts(admin.storeId)
  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">Products</h1>
        {can(admin.role, 'products.edit') && <Link href="/admin/products/new" className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium">Add product</Link>}
      </div>
      {deleted && <p role="status" className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">Product deleted.</p>}
      <div className="rounded-xl bg-white border border-slate-200 divide-y divide-slate-100">
        {products.length === 0 && <p className="p-6 text-slate-500 text-sm">No products yet. Add your first one to start selling.</p>}
        {products.map((p) => {
          const live = p.variants.filter((v) => v.isActive)
          const prices = live.map((v) => v.price.toNumber())
          const stock = live.filter((v) => v.trackStock).reduce((n, v) => n + v.stock, 0)
          const thumb = p.media[0]?.media.url
          return (
            <Link key={p.id} href={`/admin/products/${p.id}`} className="flex items-center gap-4 p-4 hover:bg-slate-50">
              <span className="h-14 w-14 shrink-0 rounded-lg bg-slate-100 overflow-hidden">
                {thumb && <img src={imageVariant(thumb, 120)} alt="" className="h-full w-full object-cover" loading="lazy" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium block truncate">{p.name}</span>
                <span className="text-sm text-slate-500">
                  {prices.length ? `${formatPrice(Math.min(...prices))}${Math.max(...prices) > Math.min(...prices) ? ` – ${formatPrice(Math.max(...prices))}` : ''}` : 'No sizes on sale'} · {stock} in stock
                </span>
              </span>
              <span className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${TONE[p.status] ?? ''}`}>{p.status.toLowerCase()}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
