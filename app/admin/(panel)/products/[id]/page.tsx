import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/guard'
import { can } from '@/lib/auth/permissions'
import { headers } from 'next/headers'
import { getProductForEdit, listMedia, listOrganisation, loadSections } from '@/lib/admin/products'
import { margin } from '@/lib/admin/product-extras'
import { formatPrice } from '@/lib/format'
import SeoFields from '@/components/admin/SeoFields'
import { duplicateProductAction } from '../actions'
import { listCategories } from '@/lib/admin/categories'
import { loadServiceViews } from '@/lib/services/store-services'
import { COUNT_UNITS, fromBase, getUnit } from '@/lib/units/registry'
import { optionGroupsToText, readOptionGroups, readOptionValues } from '@/lib/variants/rules'
import { PAIR_TYPES, SECTION_TYPES, SECTION_TYPE_LABEL, sectionItemsToText, type SectionType } from '@/lib/admin/product-rules'
import ActionForm from '@/components/admin/ActionForm'
import MediaManager from '@/components/admin/MediaManager'
import { Card, Check, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { addVariantAction, deleteProductAction, deleteVariantAction, generateVariantsAction, saveProductAction, saveSectionsAction } from './actions'

const TYPE_LABEL = { SIMPLE: 'Simple product', VARIANTS: 'Product with variants', MEASURABLE: 'Measurable product (by weight, volume or length)' } as const

export const dynamic = 'force-dynamic'
const BLANK_SECTION_SLOTS = 3

export default async function EditProduct({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; copied?: string }> }) {
  const admin = await requireAdmin('products.view')
  const [{ id }, { created, copied }] = await Promise.all([params, searchParams])
  const [p, cats, media, sections, services, org, host] = await Promise.all([
    getProductForEdit(admin.storeId, id), // every query below is scoped to this store
    listCategories(admin.storeId), listMedia(admin.storeId, id), loadSections(admin.storeId, id), loadServiceViews(admin.storeId), listOrganisation(admin.storeId), headers().then((h) => h.get('host') ?? ''),
  ])
  if (!p) notFound()
  const editable = can(admin.role, 'products.edit')
  const cloud = services.get('cloudinary')
  const unit = getUnit(p.unitCode)
  const measured = p.type === 'MEASURABLE' && !!unit
  const simple = p.type === 'SIMPLE'
  const shownStock = (stock: number) => String(measured ? fromBase(stock, unit!.code) : stock)
  const defaultVariant = p.variants.find((v) => v.isDefault) ?? p.variants[0]
  const slots = [...sections, ...Array.from({ length: BLANK_SECTION_SLOTS }, () => null)]

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <Link href="/admin/products" className="text-sm text-slate-600 underline">← All products</Link>
        <h1 className="text-2xl font-bold mt-2">{p.name}</h1>
        <p className="text-sm text-slate-500">
          {p.status === 'ACTIVE' ? <>Live at <Link className="underline" href={`/product/${p.slug}`} target="_blank">/product/{p.slug}</Link></> : <>Not visible to customers yet (status: {p.status.toLowerCase()}).</>}
          {!editable && ' · You can view but not edit.'}
        </p>
      </div>
      {copied && <p role="status" className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">This is the copy. It is a draft: check the title, prices and stock, then set the status to Active.</p>}
      {created && <p role="status" className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">Product created. Now add photos and, when ready, set the status to Active.</p>}

      <Card title="Photos and videos" hint="The first photo is the main picture. Use the arrows to change the order customers see.">
        {editable
          ? <MediaManager productId={p.id} items={media} cloudReady={!!cloud?.enabled && cloud.configured} maxItems={12} />
          : <p className="text-sm text-slate-500">{media.length} file(s).</p>}
      </Card>

      <ActionForm action={saveProductAction}>
        <input type="hidden" name="productId" value={p.id} />
        <fieldset disabled={!editable} className="contents">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start">
            <div className="space-y-6 min-w-0">
              <Card title="Details">
                <div className="grid gap-4">
                  <Field label="Title"><input name="name" defaultValue={p.name} required maxLength={120} className={inputCls} /></Field>
                  <Field label="Subtitle"><input name="subtitle" defaultValue={p.subtitle ?? ''} maxLength={160} className={inputCls} /></Field>
                  <Field label="Short description" hint="One or two lines shown near the price."><textarea name="shortDescription" defaultValue={p.shortDescription ?? ''} rows={3} maxLength={500} className={inputCls} /></Field>
                  <Field label="Description"><textarea name="description" defaultValue={p.description ?? ''} rows={8} maxLength={10000} className={inputCls} /></Field>
                </div>
              </Card>

              <Card title={simple ? 'Pricing and inventory' : measured ? `Price per ${unit!.code} and inventory` : 'Variants: pricing and inventory'}
                hint={`${measured ? `Price is for one ${unit!.code} (paisa allowed); stock is typed in ${unit!.code}.` : 'Prices are in whole rupees.'} Cost is what you pay for the item: customers never see it, it only shows your profit. Stock goes down automatically with orders and back up when an order is cancelled.`}>
                <div className="overflow-x-auto -mx-2 px-2">
                  <table className="w-full text-sm border-separate border-spacing-y-2" style={{ minWidth: simple ? 720 : 1080 }}>
                    <thead className="text-left text-xs text-slate-500">
                      <tr>
                        {!simple && <th className="font-medium pr-2">Variant</th>}
                        <th className="font-medium pr-2">Price</th><th className="font-medium pr-2">Crossed-out</th><th className="font-medium pr-2">Cost</th>
                        <th className="font-medium pr-2">In stock{measured ? ` (${unit!.code})` : ''}</th><th className="font-medium pr-2">SKU</th><th className="font-medium pr-2">Barcode</th><th className="font-medium pr-2">Weight (g)</th>
                        <th className="font-medium pr-2">Track stock</th>{!simple && <><th className="font-medium pr-2">On sale</th><th className="font-medium pr-2">First</th><th /></>}
                      </tr>
                    </thead>
                    <tbody>
                      {p.variants.map((v) => {
                        const m = margin(v.price.toNumber(), v.costPrice?.toNumber())
                        return (
                          <tr key={v.id} className="align-top">
                            {!simple && (
                              <td className="pr-2">
                                <input name={`v_${v.id}_label`} defaultValue={v.label} maxLength={40} className={inputCls} aria-label="Variant name" />
                                <input name={`v_${v.id}_badge`} defaultValue={v.badge ?? ''} maxLength={30} placeholder="Badge, e.g. Most Popular" className={`${inputCls} mt-1 text-xs`} aria-label={`Badge for ${v.label}`} />
                              </td>
                            )}
                            <td className="pr-2">
                              <input type="hidden" name={`v_${v.id}_stockWas`} value={v.stock} /><input type="hidden" name={`v_${v.id}_stockShown`} value={shownStock(v.stock)} /><input type="hidden" name={`v_${v.id}_trackSent`} value="1" />
                              {simple && <><input type="hidden" name={`v_${v.id}_label`} value={v.label} /><input type="hidden" name="defaultVariant" value={v.id} /><input type="hidden" name={`v_${v.id}_active`} value="on" /></>}
                              <input name={`v_${v.id}_price`} inputMode={measured ? 'decimal' : 'numeric'} defaultValue={v.price.toNumber()} className={inputCls} aria-label={`Price of ${v.label}`} />
                            </td>
                            <td className="pr-2"><input name={`v_${v.id}_compareAt`} inputMode={measured ? 'decimal' : 'numeric'} defaultValue={v.compareAtPrice?.toNumber() ?? ''} className={inputCls} aria-label={`Crossed-out price of ${v.label}`} /></td>
                            <td className="pr-2">
                              <input name={`v_${v.id}_cost`} inputMode="decimal" defaultValue={v.costPrice?.toNumber() ?? ''} className={inputCls} aria-label={`Cost of ${v.label}`} />
                              {m && <span className={`block text-xs mt-1 ${m.profit < 0 ? 'text-red-700' : 'text-slate-500'}`}>Profit {formatPrice(m.profit)} · {m.marginPct}%</span>}
                            </td>
                            <td className="pr-2"><input name={`v_${v.id}_stock`} inputMode={measured ? 'decimal' : 'numeric'} defaultValue={shownStock(v.stock)} className={inputCls} aria-label={`Stock of ${v.label}`} /></td>
                            <td className="pr-2"><input name={`v_${v.id}_sku`} defaultValue={v.sku} maxLength={30} className={`${inputCls} font-mono uppercase`} aria-label={`SKU of ${v.label}`} /></td>
                            <td className="pr-2"><input name={`v_${v.id}_barcode`} defaultValue={v.barcode ?? ''} maxLength={32} className={`${inputCls} font-mono`} aria-label={`Barcode of ${v.label}`} /></td>
                            <td className="pr-2"><input name={`v_${v.id}_weight`} inputMode="numeric" defaultValue={v.weightGrams ?? ''} className={inputCls} aria-label={`Weight of ${v.label} in grams`} /></td>
                            <td className="pr-2 pt-2 text-center"><input type="checkbox" name={`v_${v.id}_track`} defaultChecked={v.trackStock} className="h-4 w-4" aria-label={`Track stock of ${v.label}`} /></td>
                            {!simple && (
                              <>
                                <td className="pr-2 pt-2 text-center"><input type="checkbox" name={`v_${v.id}_active`} defaultChecked={v.isActive} className="h-4 w-4" aria-label={`${v.label} on sale`} /></td>
                                <td className="pr-2 pt-2 text-center"><input type="radio" name="defaultVariant" value={v.id} defaultChecked={v.isDefault} aria-label={`Show ${v.label} first`} /></td>
                                <td className="pt-2">{editable && p.variants.length > 1 && <button type="submit" form={`rm-${v.id}`} className="text-xs text-red-700 underline">Delete</button>}</td>
                              </>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-500 mt-2">Untick “Track stock” for items you never run out of (made to order, services): they can always be bought and their stock number is ignored.</p>
              </Card>

              <Card title="Search engine listing" hint="How this product may appear on Google, and its page address.">
                <SeoFields name={p.name} shortDescription={p.shortDescription ?? ''} seoTitle={p.seoTitle ?? ''} seoDescription={p.seoDescription ?? ''} slug={p.slug} host={host} editableSlug />
              </Card>
              {editable && <button className={primaryBtn}>Save product</button>}
            </div>

            <div className="space-y-6 lg:sticky lg:top-4">
              <Card title="Status">
                <div className="grid gap-3">
                  <select name="status" defaultValue={p.status} className={inputCls} aria-label="Status">
                    <option value="ACTIVE">Active (live in the shop)</option><option value="DRAFT">Draft (hidden)</option><option value="ARCHIVED">Archived (hidden, history kept)</option>
                  </select>
                  <Check name="isFeatured" label="Feature this product" hint="Shown first on the shop page." defaultChecked={p.isFeatured} />
                  {editable && <button className={primaryBtn}>Save product</button>}
                </div>
              </Card>
              <Card title="Organisation">
                <div className="grid gap-4">
                  <Field label="Category">
                    <select name="categoryId" className={inputCls} defaultValue={p.categoryId ?? ''}><option value="">No category</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                  </Field>
                  <Field label="Vendor" hint="The brand or supplier."><input name="vendor" defaultValue={p.vendor ?? ''} maxLength={80} list="vendors" className={inputCls} /></Field>
                  <datalist id="vendors">{org.vendors.map((v) => <option key={v} value={v} />)}</datalist>
                  <Field label="Tags" hint={`Separate with commas, e.g. summer, gift. Used to search and group products.${org.tags.length ? ` Already used: ${org.tags.slice(0, 12).join(', ')}` : ''}`}><input name="tags" defaultValue={p.tags.join(', ')} maxLength={700} className={inputCls} /></Field>
                </div>
              </Card>
              <Card title="How it is sold">
                <p className="text-sm text-slate-600 mb-3"><strong>{TYPE_LABEL[p.type]}</strong>. The type is chosen when a product is created.</p>
                {measured ? (
                  <div className="grid gap-4">
                    <Field label={`Smallest order (${unit!.code})`} hint="The least a customer can buy, e.g. 0.5"><input name="qtyMin" inputMode="decimal" defaultValue={fromBase(p.qtyMin ?? p.qtyStep ?? unit!.factor * unit!.defaultStep, unit!.code)} className={inputCls} /></Field>
                    <Field label={`Order step (${unit!.code})`} hint="Customers add or remove this much at a time, e.g. 0.25"><input name="qtyStep" inputMode="decimal" defaultValue={fromBase(p.qtyStep ?? unit!.factor * unit!.defaultStep, unit!.code)} className={inputCls} /></Field>
                  </div>
                ) : (
                  <Field label="Counted in" hint="Stock and orders are whole numbers of this unit."><select name="unitCode" defaultValue={p.unitCode ?? 'piece'} className={inputCls}>{COUNT_UNITS.map((u) => <option key={u.code} value={u.code}>{u.label}</option>)}</select></Field>
                )}
              </Card>
            </div>
          </div>
        </fieldset>
      </ActionForm>

      {/* Forms for the "Delete size" buttons above (a form cannot sit inside another form). */}
      {editable && p.variants.map((v) => (
        <ActionForm key={v.id} id={`rm-${v.id}`} action={deleteVariantAction} confirm={`Delete the variant “${v.label}”? Past orders keep their details.`}>
          <input type="hidden" name="productId" value={p.id} /><input type="hidden" name="variantId" value={v.id} />
        </ActionForm>
      ))}

      {editable && p.type === 'VARIANTS' && (
        <Card title="Options and automatic variants" hint="List your options, one per line, like “Size: S, M, L” and “Colour: Red, Blue”. The system builds every combination as its own variant with its own SKU, price and stock. Existing variants keep their price and stock; combinations you remove are switched off, never deleted. Save your changes above first.">
          <ActionForm action={generateVariantsAction} className="space-y-3">
            <input type="hidden" name="productId" value={p.id} />
            <Field label="Options"><textarea name="options" rows={3} defaultValue={optionGroupsToText(readOptionGroups(p.optionGroups))} placeholder={'Size: S, M, L\nColour: Red, Blue'} className={`${inputCls} font-mono`} /></Field>
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Starting price for NEW variants (Rs.)"><input name="gen_price" required inputMode="numeric" defaultValue={defaultVariant?.price.toNumber()} className={inputCls} /></Field>
              <Field label="Crossed-out price"><input name="gen_compareAt" inputMode="numeric" defaultValue={defaultVariant?.compareAtPrice?.toNumber() ?? ''} className={inputCls} /></Field>
              <Field label="Starting stock for NEW variants"><input name="gen_stock" inputMode="numeric" defaultValue="0" className={inputCls} /></Field>
            </div>
            <button className={primaryBtn}>Build variants</button>
          </ActionForm>
        </Card>
      )}

      {editable && !simple && (
        <Card title={p.type === 'VARIANTS' ? 'Add one variant by hand' : 'Add another variant'} hint={measured ? 'For example a second grade of the same product, each with its own price per unit.' : undefined}>
          <ActionForm action={addVariantAction} className="space-y-3">
            <input type="hidden" name="productId" value={p.id} />
            <div className="grid sm:grid-cols-5 gap-3 items-end">
              <Field label="Variant name"><input name="nv_label" required maxLength={40} placeholder={measured ? 'Grade B' : '200ml'} className={inputCls} /></Field>
              <Field label={measured ? `Price (Rs. per ${unit!.code})` : 'Price (Rs.)'}><input name="nv_price" required inputMode={measured ? 'decimal' : 'numeric'} className={inputCls} /></Field>
              <Field label="Crossed-out price"><input name="nv_compareAt" inputMode={measured ? 'decimal' : 'numeric'} className={inputCls} /></Field>
              <Field label={measured ? `In stock (${unit!.code})` : 'In stock'}><input name="nv_stock" inputMode={measured ? 'decimal' : 'numeric'} defaultValue="0" className={inputCls} /></Field>
              <Field label="Badge"><input name="nv_badge" maxLength={30} className={inputCls} /></Field>
            </div>
            <button className={primaryBtn}>Add variant</button>
          </ActionForm>
        </Card>
      )}

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
        <Card title="Duplicate this product" hint="Makes a full copy as a draft: variants (with new SKUs), photos and videos, page sections, category, vendor, tags, options and search text. Reviews, orders and barcodes stay with the original.">
          <ActionForm action={duplicateProductAction} className="space-y-3">
            <input type="hidden" name="productId" value={p.id} />
            <Check name="copyStock" label="Copy the stock numbers too" hint="Leave unticked to start the copy with zero stock." />
            <button className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium">Duplicate</button>
          </ActionForm>
        </Card>
      )}

      {editable && (
        <section className="rounded-xl bg-white border border-red-200 p-5 sm:p-6">
          <h2 className="font-semibold text-lg text-red-800">Delete product</h2>
          <p className="text-sm text-slate-600 mt-1 mb-4">Deleting removes the product, its variants, photos and sections for good. Products that have been ordered cannot be deleted; archive them instead.</p>
          <ActionForm action={deleteProductAction} confirm={`Delete “${p.name}” permanently?`}>
            <input type="hidden" name="productId" value={p.id} />
            <button className="rounded-lg bg-red-600 text-white px-5 py-2 text-sm font-medium">Delete this product</button>
          </ActionForm>
        </section>
      )}
    </div>
  )
}
