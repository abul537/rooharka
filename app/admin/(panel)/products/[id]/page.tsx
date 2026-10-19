import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/guard'
import { can } from '@/lib/auth/permissions'
import { getProductForEdit, listMedia, loadSections } from '@/lib/admin/products'
import { listCategories } from '@/lib/admin/categories'
import { loadServiceViews } from '@/lib/services/store-services'
import { PAIR_TYPES, PRODUCT_STATUSES, SECTION_TYPES, SECTION_TYPE_LABEL, sectionItemsToText, type SectionType } from '@/lib/admin/product-rules'
import ActionForm from '@/components/admin/ActionForm'
import MediaManager from '@/components/admin/MediaManager'
import { Card, Check, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { addVariantAction, deleteProductAction, deleteVariantAction, saveProductAction, saveSectionsAction } from './actions'

export const dynamic = 'force-dynamic'
const BLANK_SECTION_SLOTS = 3

export default async function EditProduct({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const admin = await requireAdmin('products.view')
  const [{ id }, { created }] = await Promise.all([params, searchParams])
  const [p, cats, media, sections, services] = await Promise.all([
    getProductForEdit(admin.storeId, id), // every query below is scoped to this store
    listCategories(admin.storeId), listMedia(admin.storeId, id), loadSections(admin.storeId, id), loadServiceViews(admin.storeId),
  ])
  if (!p) notFound()
  const editable = can(admin.role, 'products.edit')
  const cloud = services.get('cloudinary')
  const slots = [...sections, ...Array.from({ length: BLANK_SECTION_SLOTS }, () => null)]

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/admin/products" className="text-sm text-slate-600 underline">← All products</Link>
        <h1 className="text-2xl font-bold mt-2">{p.name}</h1>
        <p className="text-sm text-slate-500">
          {p.status === 'ACTIVE' ? <>Live at <Link className="underline" href={`/product/${p.slug}`} target="_blank">/product/{p.slug}</Link></> : <>Not visible to customers yet (status: {p.status.toLowerCase()}).</>}
          {!editable && ' · You can view but not edit.'}
        </p>
      </div>
      {created && <p role="status" className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">Product created. Now add photos and, when ready, set the status to Active.</p>}

      <ActionForm action={saveProductAction} className="space-y-6">
        <input type="hidden" name="productId" value={p.id} />
        <fieldset disabled={!editable} className="contents">
          <Card title="Details">
            <div className="grid gap-4">
              <Field label="Name"><input name="name" defaultValue={p.name} required maxLength={120} className={inputCls} /></Field>
              <Field label="Subtitle"><input name="subtitle" defaultValue={p.subtitle ?? ''} maxLength={160} className={inputCls} /></Field>
              <Field label="Short description"><textarea name="shortDescription" defaultValue={p.shortDescription ?? ''} rows={3} maxLength={500} className={inputCls} /></Field>
              <Field label="Full description"><textarea name="description" defaultValue={p.description ?? ''} rows={8} maxLength={10000} className={inputCls} /></Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Category">
                  <select name="categoryId" className={inputCls} defaultValue={p.categoryId ?? ''}><option value="">No category</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                </Field>
                <Field label="Status" hint="Only “active” products are visible and can be bought. Archive a product to hide it but keep its order history.">
                  <select name="status" defaultValue={p.status} className={inputCls}>{PRODUCT_STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</select>
                </Field>
              </div>
              <Check name="isFeatured" label="Feature this product (shown first on the shop page)" defaultChecked={p.isFeatured} />
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Search engine title (optional)" hint="Up to 70 characters"><input name="seoTitle" defaultValue={p.seoTitle ?? ''} maxLength={70} className={inputCls} /></Field>
                <Field label="Search engine description (optional)" hint="Up to 160 characters"><input name="seoDescription" defaultValue={p.seoDescription ?? ''} maxLength={160} className={inputCls} /></Field>
              </div>
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
                  <div className="grid sm:grid-cols-[1fr_auto_auto_auto] gap-3 mt-3 items-end">
                    <Field label="Badge (optional)"><input name={`v_${v.id}_badge`} defaultValue={v.badge ?? ''} maxLength={30} placeholder="Most Popular" className={inputCls} /></Field>
                    <Check name={`v_${v.id}_active`} label="On sale" defaultChecked={v.isActive} />
                    <label className="flex items-center gap-2 text-sm"><input type="radio" name="defaultVariant" value={v.id} defaultChecked={v.isDefault} /> Shown first</label>
                    {editable && p.variants.length > 1 && <button type="submit" form={`rm-${v.id}`} className="text-sm text-red-700 underline">Delete size</button>}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">SKU: {v.sku}</p>
                </div>
              ))}
            </div>
          </Card>
          {editable && <button className={primaryBtn}>Save product</button>}
        </fieldset>
      </ActionForm>

      {/* Forms for the "Delete size" buttons above (a form cannot sit inside another form). */}
      {editable && p.variants.map((v) => (
        <ActionForm key={v.id} id={`rm-${v.id}`} action={deleteVariantAction} confirm={`Delete the size “${v.label}”? Past orders keep their details.`}>
          <input type="hidden" name="productId" value={p.id} /><input type="hidden" name="variantId" value={v.id} />
        </ActionForm>
      ))}

      {editable && (
        <Card title="Add another size">
          <ActionForm action={addVariantAction} className="space-y-3">
            <input type="hidden" name="productId" value={p.id} />
            <div className="grid sm:grid-cols-5 gap-3 items-end">
              <Field label="Size name"><input name="nv_label" required maxLength={40} placeholder="200ml" className={inputCls} /></Field>
              <Field label="Price (Rs.)"><input name="nv_price" required inputMode="numeric" className={inputCls} /></Field>
              <Field label="Crossed-out price"><input name="nv_compareAt" inputMode="numeric" className={inputCls} /></Field>
              <Field label="In stock"><input name="nv_stock" inputMode="numeric" defaultValue="0" className={inputCls} /></Field>
              <Field label="Badge"><input name="nv_badge" maxLength={30} className={inputCls} /></Field>
            </div>
            <button className={primaryBtn}>Add size</button>
          </ActionForm>
        </Card>
      )}

      <Card title="Photos and videos" hint="The first photo is the main picture. Use the arrows to change the order customers see.">
        {editable
          ? <MediaManager productId={p.id} items={media} cloudReady={!!cloud?.enabled && cloud.configured} maxItems={12} />
          : <p className="text-sm text-slate-500">{media.length} file(s).</p>}
      </Card>

      <Card title="Product page sections" hint="Extra information blocks shown on the product page, such as benefits, how to use, and questions. Sections with the same tab name share a tab. Pair types take one “title | text” per line; other types take one item per line.">
        {editable ? (
          <ActionForm action={saveSectionsAction} className="space-y-4">
            <input type="hidden" name="productId" value={p.id} /><input type="hidden" name="count" value={slots.length} />
            {slots.map((s, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-4 space-y-3">
                <p className="text-sm font-semibold">{s ? `Section ${i + 1}` : `New section`}</p>
                <div className="grid sm:grid-cols-4 gap-3">
                  <Field label="Type">
                    <select name={`s${i}_type`} defaultValue={s?.type ?? 'BULLETS'} className={inputCls}>{SECTION_TYPES.map((t) => <option key={t} value={t}>{SECTION_TYPE_LABEL[t]}</option>)}</select>
                  </Field>
                  <Field label="Heading"><input name={`s${i}_title`} defaultValue={s?.title ?? ''} maxLength={120} className={inputCls} /></Field>
                  <Field label="Tab name (optional)"><input name={`s${i}_tab`} defaultValue={s?.tab ?? ''} maxLength={30} placeholder="benefits" className={inputCls} /></Field>
                  <Field label="Tab label (optional)"><input name={`s${i}_tabLabel`} defaultValue={s?.tabLabel ?? ''} maxLength={30} className={inputCls} /></Field>
                </div>
                <Field label="Content" hint={s && PAIR_TYPES.includes(s.type as SectionType) ? 'One “title | text” per line' : 'One item per line (for Cards, Questions and Key benefits use “title | text”)'}>
                  <textarea name={`s${i}_items`} defaultValue={s ? sectionItemsToText(s.type as SectionType, s.items) : ''} rows={4} className={`${inputCls} font-mono`} />
                </Field>
                <div className="flex gap-6"><Check name={`s${i}_visible`} label="Visible" defaultChecked={s?.isVisible ?? true} />{s && <Check name={`s${i}_remove`} label="Remove this section" />}</div>
              </div>
            ))}
            <button className={primaryBtn}>Save sections</button>
          </ActionForm>
        ) : <p className="text-sm text-slate-500">{sections.length} section(s).</p>}
      </Card>

      {editable && (
        <section className="rounded-xl bg-white border border-red-200 p-5 sm:p-6">
          <h2 className="font-semibold text-lg text-red-800">Delete product</h2>
          <p className="text-sm text-slate-600 mt-1 mb-4">Deleting removes the product, its sizes, photos and sections for good. Products that have been ordered cannot be deleted; archive them instead.</p>
          <ActionForm action={deleteProductAction} confirm={`Delete “${p.name}” permanently?`}>
            <input type="hidden" name="productId" value={p.id} />
            <button className="rounded-lg bg-red-600 text-white px-5 py-2 text-sm font-medium">Delete this product</button>
          </ActionForm>
        </section>
      )}
    </div>
  )
}
