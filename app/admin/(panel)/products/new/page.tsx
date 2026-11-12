import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/guard'
import { listCategories } from '@/lib/admin/categories'
import ActionForm from '@/components/admin/ActionForm'
import { Card, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import ProductTypeFields from '@/components/admin/ProductTypeFields'
import { createProductAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function NewProduct() {
  const admin = await requireAdmin('products.edit')
  const cats = await listCategories(admin.storeId)
  return (
    <div className="max-w-3xl">
      <Link href="/admin/products" className="text-sm text-slate-600 underline">← All products</Link>
      <h1 className="text-2xl font-bold mt-2 mb-1">Add a product</h1>
      <p className="text-sm text-slate-600 mb-6">Start with the basics. After saving you can add photos, videos, more variants and page sections.</p>
      <ActionForm action={createProductAction} className="space-y-6">
        <Card title="Details">
          <div className="grid gap-4">
            <Field label="Name"><input name="name" required maxLength={120} className={inputCls} /></Field>
            <Field label="Subtitle (optional)"><input name="subtitle" maxLength={160} className={inputCls} /></Field>
            <Field label="Short description (optional)"><textarea name="shortDescription" rows={3} maxLength={500} className={inputCls} /></Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Category (optional)">
                <select name="categoryId" className={inputCls} defaultValue=""><option value="">No category</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              </Field>
              <Field label="Status" hint="Keep it a draft until you are ready; only “active” products are visible and can be bought.">
                <select name="status" className={inputCls} defaultValue="DRAFT"><option value="DRAFT">Draft</option><option value="ACTIVE">Active (live)</option></select>
              </Field>
            </div>
            <Field label="Page address (optional)" hint="Made from the name if empty, e.g. rose-water"><input name="slug" maxLength={60} className={inputCls} /></Field>
          </div>
        </Card>
        <Card title="How it is sold, price and stock" hint="Choose the type first: it decides which fields you need. The type cannot be changed later.">
          <ProductTypeFields />
        </Card>
        <button className={primaryBtn}>Create product</button>
      </ActionForm>
    </div>
  )
}
