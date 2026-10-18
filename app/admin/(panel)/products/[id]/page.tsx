import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/guard'
import { can } from '@/lib/auth/permissions'
import { getProductForEdit } from '@/lib/admin/products'
import { PRODUCT_STATUSES } from '@/lib/admin/product-rules'
import ActionForm from '@/components/admin/ActionForm'
import { Card, Check, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { saveProductAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin('products.view')
  const { id } = await params
  const p = await getProductForEdit(admin.storeId, id) // scoped to this store
  if (!p) notFound()
  const editable = can(admin.role, 'products.edit')

  return (
    <div className="max-w-3xl">
      <Link href="/admin/products" className="text-sm text-slate-600 underline">← All products</Link>
      <h1 className="text-2xl font-bold mt-2 mb-1">{p.name}</h1>
      <p className="text-sm text-slate-500 mb-6">Page address: /product/{p.slug}{!editable && ' · You can view but not edit.'}</p>

      <ActionForm action={saveProductAction} className="space-y-6">
        <input type="hidden" name="productId" value={p.id} />
        <fieldset disabled={!editable} className="space-y-6 contents">
          <Card title="Details">
            <div className="grid gap-4">
              <Field label="Name"><input name="name" defaultValue={p.name} required maxLength={120} className={inputCls} /></Field>
              <Field label="Subtitle"><input name="subtitle" defaultValue={p.subtitle ?? ''} maxLength={160} className={inputCls} /></Field>
              <Field label="Short description"><textarea name="shortDescription" defaultValue={p.shortDescription ?? ''} rows={3} maxLength={500} className={inputCls} /></Field>
              <Field label="Status" hint="Only “active” products can be bought.">
                <select name="status" defaultValue={p.status} className={inputCls}>
                  {PRODUCT_STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
                </select>
              </Field>
            </div>
          </Card>

          <Card title="Sizes, prices and stock" hint="Prices are in whole rupees. Stock goes down automatically when orders arrive and back up when an order is cancelled.">
            <div className="space-y-4">
              {p.variants.map((v) => (
                <div key={v.id} className="rounded-lg border border-slate-200 p-4">
                  <input type="hidden" name={`v_${v.id}_stockWas`} value={v.stock} />
                  <div className="grid sm:grid-cols-4 gap-3">
                    <Field label="Size name"><input name={`v_${v.id}_label`} defaultValue={v.label} maxLength={40} className={inputCls} /></Field>
                    <Field label="Price (Rs.)"><input name={`v_${v.id}_price`} inputMode="numeric" defaultValue={v.price.toNumber()} className={inputCls} /></Field>
                    <Field label="Crossed-out price"><input name={`v_${v.id}_compareAt`} inputMode="numeric" defaultValue={v.compareAtPrice?.toNumber() ?? ''} className={inputCls} /></Field>
                    <Field label="In stock"><input name={`v_${v.id}_stock`} inputMode="numeric" defaultValue={v.stock} className={inputCls} /></Field>
                  </div>
                  <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3 mt-3 items-end">
                    <Field label="Badge (optional)"><input name={`v_${v.id}_badge`} defaultValue={v.badge ?? ''} maxLength={30} placeholder="Most Popular" className={inputCls} /></Field>
                    <Check name={`v_${v.id}_active`} label="On sale" defaultChecked={v.isActive} />
                    <label className="flex items-center gap-2 text-sm"><input type="radio" name="defaultVariant" value={v.id} defaultChecked={v.isDefault} /> Shown first</label>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          {editable && <button className={primaryBtn}>Save product</button>}
        </fieldset>
      </ActionForm>
    </div>
  )
}
