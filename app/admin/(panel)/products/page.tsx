import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/guard'
import { can } from '@/lib/auth/permissions'
import { listProducts } from '@/lib/admin/products'
import { listCategories } from '@/lib/admin/categories'
import { LIST_PAGE_SIZE, LIST_SORTS, LIST_SORT_LABEL, LOW_STOCK_AT, listHref, pageCount, parseListQuery } from '@/lib/admin/product-extras'
import { formatPrice } from '@/lib/format'
import { imageVariant } from '@/lib/media/urls'
import { formatQuantity, perUnit } from '@/lib/units/registry'
import ActionForm from '@/components/admin/ActionForm'
import ProductBulkBar from '@/components/admin/ProductBulkBar'
import { inputCls } from '@/components/admin/ui'
import { bulkProductsAction } from './actions'

export const dynamic = 'force-dynamic'

const TONE: Record<string, string> = { ACTIVE: 'bg-emerald-100 text-emerald-800', DRAFT: 'bg-amber-100 text-amber-800', ARCHIVED: 'bg-slate-200 text-slate-700' }
const TABS = [{ key: null, label: 'All' }, { key: 'ACTIVE', label: 'Active' }, { key: 'DRAFT', label: 'Draft' }, { key: 'ARCHIVED', label: 'Archived' }] as const
const pill = (on: boolean) => `rounded-full px-3 py-1 text-sm font-medium ${on ? 'bg-slate-900 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}`

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdmin('products.view')
  const sp = await searchParams
  const q = parseListQuery(sp)
  const [{ rows, total, counts }, cats] = await Promise.all([listProducts(admin.storeId, q), listCategories(admin.storeId)])
  const editable = can(admin.role, 'products.edit')
  const all = counts.ACTIVE + counts.DRAFT + counts.ARCHIVED
  const pages = pageCount(total)
  const filtered = !!(q.q || q.status || q.type || q.categoryId || q.tag || q.stock)

  const list = (
    <div className="divide-y divide-slate-100">
      {rows.length === 0 && <p className="p-6 text-slate-500 text-sm">{filtered ? 'No products match. Change or clear the filters.' : 'No products yet. Add your first one to start selling.'}</p>}
      {rows.map((p) => {
        const live = p.variants.filter((v) => v.isActive)
        const prices = live.map((v) => v.price.toNumber())
        const tracked = live.filter((v) => v.trackStock)
        const stock = tracked.reduce((n, v) => n + v.stock, 0)
        const soldOut = live.length > 0 && live.every((v) => v.trackStock && v.stock <= 0)
        const low = !soldOut && p.type !== 'MEASURABLE' && tracked.some((v) => v.stock > 0 && v.stock <= LOW_STOCK_AT)
        const thumb = p.media[0]?.media.url
        return (
          <div key={p.id} className="flex items-center gap-3 p-3 sm:p-4 hover:bg-slate-50">
            {editable && <input type="checkbox" name="ids" value={p.id} className="h-4 w-4 shrink-0" aria-label={`Select ${p.name}`} />}
            <Link href={`/admin/products/${p.id}`} className="flex min-w-0 flex-1 items-center gap-4">
              <span className="h-14 w-14 shrink-0 rounded-lg bg-slate-100 overflow-hidden">
                {thumb && <img src={imageVariant(thumb, 120)} alt="" className="h-full w-full object-cover" loading="lazy" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium block truncate">{p.name}{p.isFeatured && <span className="ml-2 text-xs text-amber-700">★ featured</span>}</span>
                <span className="text-sm text-slate-500 block truncate">
                  {prices.length ? `${formatPrice(Math.min(...prices))}${Math.max(...prices) > Math.min(...prices) ? ` – ${formatPrice(Math.max(...prices))}` : ''}${p.type === 'MEASURABLE' ? ` ${perUnit(p.unitCode) ?? ''}` : ''}` : 'Nothing on sale'}
                  {' · '}{tracked.length ? `${formatQuantity(stock, p.unitCode)} in stock` : 'stock not tracked'}
                  {' · '}{p.type === 'SIMPLE' ? 'simple' : p.type === 'VARIANTS' ? `${live.length} variant${live.length === 1 ? '' : 's'}` : 'measured'}
                  {p.category && ` · ${p.category.name}`}{p.vendor && ` · ${p.vendor}`}
                </span>
              </span>
              {soldOut && <span className="text-xs font-medium rounded-full px-2.5 py-0.5 bg-red-100 text-red-800">sold out</span>}
              {low && <span className="text-xs font-medium rounded-full px-2.5 py-0.5 bg-orange-100 text-orange-800">low stock</span>}
              <span className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${TONE[p.status] ?? ''}`}>{p.status.toLowerCase()}</span>
            </Link>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">Products</h1>
        <div className="flex gap-2">
          <a href="/admin/products/export" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium" download>Export (CSV)</a>
          {editable && <Link href="/admin/products/new" className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium">Add product</Link>}
        </div>
      </div>
      {sp.deleted && <p role="status" className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">Product deleted.</p>}

      <nav aria-label="Status" className="flex flex-wrap gap-2 mb-3">
        {TABS.map((t) => <Link key={t.label} href={listHref(q, { status: t.key })} className={pill(q.status === t.key)}>{t.label} ({t.key ? counts[t.key] : all})</Link>)}
        <Link href={listHref(q, { stock: q.stock === 'low' ? null : 'low' })} className={pill(q.stock === 'low')}>Low stock</Link>
        <Link href={listHref(q, { stock: q.stock === 'out' ? null : 'out' })} className={pill(q.stock === 'out')}>Sold out</Link>
      </nav>

      {/* A plain GET form: the filters live in the address, so a filtered list can be bookmarked or shared with staff. */}
      <form method="get" action="/admin/products" className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] mb-4">
        {q.status && <input type="hidden" name="status" value={q.status} />}{q.stock && <input type="hidden" name="stock" value={q.stock} />}
        <input name="q" defaultValue={q.q} maxLength={80} placeholder="Search name, SKU, barcode, vendor or tag" className={inputCls} aria-label="Search products" />
        <select name="category" defaultValue={q.categoryId ?? ''} className={inputCls} aria-label="Category"><option value="">All categories</option><option value="none">No category</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="type" defaultValue={q.type ?? ''} className={inputCls} aria-label="Product type"><option value="">All types</option><option value="SIMPLE">Simple</option><option value="VARIANTS">With variants</option><option value="MEASURABLE">Measurable</option></select>
        <select name="sort" defaultValue={q.sort} className={inputCls} aria-label="Sort">{LIST_SORTS.map((s) => <option key={s} value={s}>{LIST_SORT_LABEL[s]}</option>)}</select>
        <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium">Apply</button>
      </form>
      {filtered && <p className="text-sm text-slate-600 mb-3">{total} product{total === 1 ? '' : 's'} found{q.tag && <> with tag “{q.tag}”</>}. <Link href="/admin/products" className="underline">Clear filters</Link></p>}

      <div className="rounded-xl bg-white border border-slate-200">
        {editable ? <ActionForm action={bulkProductsAction}><ProductBulkBar categories={cats.map((c) => ({ id: c.id, name: c.name }))} />{list}</ActionForm> : list}
      </div>

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between mt-4 text-sm">
          {q.page > 1 ? <Link href={listHref(q, { page: q.page - 1 })} className="underline">← Previous</Link> : <span />}
          <span className="text-slate-600">Page {Math.min(q.page, pages)} of {pages} · {LIST_PAGE_SIZE} per page</span>
          {q.page < pages ? <Link href={listHref(q, { page: q.page + 1 })} className="underline">Next →</Link> : <span />}
        </nav>
      )}
    </div>
  )
}
