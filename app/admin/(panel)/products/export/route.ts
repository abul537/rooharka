import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { exportRows } from '@/lib/admin/products'
import { EXPORT_HEADER, toCsv } from '@/lib/admin/product-extras'
import { fromBase, getUnit } from '@/lib/units/registry'

export const dynamic = 'force-dynamic'

/** Downloads the store's whole catalogue as a spreadsheet (CSV), one row per variant. Only for signed-in staff of this store. */
export async function GET() {
  const g = await adminOrError('products.view')
  if ('error' in g) return new Response('Please sign in.', { status: 401 })
  const products = await exportRows(g.admin.storeId)
  const rows = products.flatMap((p) => {
    const unit = getUnit(p.unitCode)
    const measured = p.type === 'MEASURABLE' && !!unit
    return p.variants.map((v) => [
      p.name, p.slug, p.status.toLowerCase(), p.type.toLowerCase(), p.category?.name ?? '', p.vendor ?? '', p.tags.join(', '),
      v.label, v.sku, v.barcode ?? '', v.price.toNumber(), v.compareAtPrice?.toNumber() ?? '', v.costPrice?.toNumber() ?? '',
      measured ? fromBase(v.stock, unit!.code) : v.stock, unit?.code ?? 'piece', v.trackStock, v.isActive, v.weightGrams ?? '',
    ])
  })
  await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'product.export', entity: 'Product', after: { rows: rows.length } })
  return new Response(toCsv(EXPORT_HEADER, rows), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' },
  })
}
