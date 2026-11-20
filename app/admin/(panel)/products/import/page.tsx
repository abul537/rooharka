import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/guard'
import { EXPORT_HEADER } from '@/lib/admin/product-extras'
import { IMPORT_MAX_ROWS } from '@/lib/admin/product-import'
import ProductImport from '@/components/admin/ProductImport'
import { Card } from '@/components/admin/ui'
import { loadPlanAccess } from '@/lib/plans/access'
import { ProLock } from '@/components/admin/ProLock'

export const dynamic = 'force-dynamic'

/** Add or update many products at once from a spreadsheet. */
export default async function ImportPage() {
  const admin = await requireAdmin('products.edit')
  if (!(await loadPlanAccess(admin.storeId)).has('product-import')) return <ProLock feature="product-import" title="Import products" />
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/admin/products" className="text-sm text-slate-600 underline">← Products</Link>
        <h1 className="mt-2 text-2xl font-bold">Import products</h1>
        <p className="mt-1 text-sm text-slate-600">Change many prices or stock numbers at once, or add many products, from a spreadsheet. You see what the file would do before anything is saved, and nothing is ever deleted by an import.</p>
      </div>
      <Card title="1. Prepare the file" hint="The file must be a CSV (in Excel or Google Sheets: File, Download or Save as, CSV).">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
          <li>The easiest way: <a href="/admin/products/export" className="font-medium underline">download your products</a>, change the numbers in the file, and import it back.</li>
          <li><strong>A SKU your shop already has</strong>: that variant’s price, crossed-out price, cost, stock and “on sale” are updated. Empty cells are left as they are.</li>
          <li><strong>A new SKU, or no SKU, with a product name</strong>: a new product is created as a <strong>draft</strong>. Rows with the same product name become its variants. Add photos and publish it afterwards.</li>
          <li>Columns it understands: {EXPORT_HEADER.filter((h) => !['Page address', 'Type', 'Unit', 'Tracks stock', 'Weight (g)'].includes(h)).join(', ')}.</li>
          <li>At most {IMPORT_MAX_ROWS.toLocaleString('en-PK')} rows and 1 MB per file. Products sold by weight or length keep their stock (change it in the dashboard).</li>
        </ul>
      </Card>
      <Card title="2. Choose the file and check it"><ProductImport /></Card>
    </div>
  )
}
