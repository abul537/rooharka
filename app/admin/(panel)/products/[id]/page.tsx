import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/guard'
import { can } from '@/lib/auth/permissions'
import { headers } from 'next/headers'
import { getProductForEdit, listMedia, listOrganisation, loadSections, videoLimitBytes } from '@/lib/admin/products'
import SeoFields from '@/components/admin/SeoFields'
import VariantGrid from '@/components/admin/VariantGrid'
import RichTextEditor from '@/components/admin/RichTextEditor'
import ShippingFields from '@/components/admin/ShippingFields'
import TaxonomyPicker from '@/components/admin/TaxonomyPicker'
import { COUNTRY_CODES, countryName, descriptionHtml, htmlToText, isWeightUnit, showWeight } from '@/lib/admin/product-mvp'
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
  const [p, cats, media, sections, services, org, host, videoMax] = await Promise.all([
    getProductForEdit(admin.storeId, id), // every query below is scoped to this store
    listCategories(admin.storeId), listMedia(admin.storeId, id), loadSections(admin.storeId, id), loadServiceViews(admin.storeId), listOrganisation(admin.storeId), headers().then((h) => h.get('host') ?? ''), videoLimitBytes(admin.storeId),
  ])
  if (!p) notFound()
  const editable = can(admin.role, 'products.edit')
  const cloud = services.get('cloudinary')
  const unit = getUnit(p.unitCode)
  const measured = p.type === 'MEASURABLE' && !!unit
  const simple = p.type === 'SIMPLE'
  const shownStock = (stock: number) => String(measured ? fromBase(stock, unit!.code) : stock)
  const defaultVariant = p.variants.find((v) => v.isDefault) ?? p.variants[0]
  const wUnit = isWeightUnit(p.weightUnit) ? p.weightUnit : 'g'
  const images = media.filter((m) => m.kind === 'IMAGE')
  const countries = COUNTRY_CODES.map((code) => ({ code, name: countryName(code) }))
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
          ? <MediaManager productId={p.id} items={media} cloudReady={!!cloud?.enabled && cloud.configured} maxItems={12} videoMaxMb={Math.round(videoMax / 1024 / 1024)} />
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
                  <div><span className="block text-sm font-medium mb-1">Description</span><RichTextEditor name="description" initialHtml={descriptionHtml(p.description)} /></div>
                </div>
              </Card>

              <Card title={simple ? 'Pricing and inventory' : measured ? `Price per ${unit!.code} and inventory` : 'Variants: pricing and inventory'}
                hint={`${measured ? `Price is for one ${unit!.code} (paisa allowed); stock is typed in ${unit!.code}.` : 'Prices are in whole rupees.'} Cost is what you pay for the item: customers never see it, it only shows your profit. Stock goes down automatically with orders and back up when an order is cancelled.`}>
                {/* The key changes whenever saved data changes (a save, or an order that moved stock), so the table restarts from fresh numbers. */}
                <VariantGrid key={`${p.updatedAt.getTime()}:${p.variants.map((v) => `${v.id}.${v.stock}`).join(',')}`}
                  simple={simple} measured={measured} unit={unit?.code ?? null} weightUnit={wUnit} editable={editable} canDelete={p.variants.length > 1}
                  defaultId={defaultVariant?.id ?? ''} images={images.map((m, i) => ({ id: m.assetId, label: `Photo ${i + 1}${m.alt ? `: ${m.alt.slice(0, 20)}` : ''}` }))}
                  rows={p.variants.map((v) => ({
                    id: v.id, label: v.label, badge: v.badge ?? '', price: String(v.price.toNumber()), compareAt: v.compareAtPrice ? String(v.compareAtPrice.toNumber()) : '', cost: v.costPrice ? String(v.costPrice.toNumber()) : '',
                    stock: shownStock(v.stock), stockShown: shownStock(v.stock), stockWas: v.stock, sku: v.sku, barcode: v.barcode ?? '', weight: showWeight(v.weightGrams, wUnit), image: v.imageId ?? '',
                    track: v.trackStock, active: v.isActive, fromOptions: !!readOptionValues(v.optionValues),
                  }))}
                />
                <p className="text-xs text-slate-500 mt-2">Untick “Track stock” for items you never run out of (made to order, services): they can always be bought and their stock number is ignored.{images.length > 0 && ' “Photo” is the picture shown when a customer picks that variant.'}</p>
                <div className="grid gap-3 mt-4 border-t border-slate-100 pt-4">
                  <input type="hidden" name="optionsSent" value="1" />
                  <Check name="allowBackorder" label="Continue selling when out of stock" hint="Customers can still order at zero stock; the stock number keeps counting down (below zero) so you know how many you owe." defaultChecked={p.variants.some((v) => v.allowBackorder)} />
                  <Check name="taxable" label="Charge tax on this product" hint="Recorded on the product for your accounts and future tax settings." defaultChecked={p.taxable} />
                </div>
              </Card>

              <Card title="Search engine listing" hint="How this product may appear on Google, and its page address.">
                <SeoFields name={p.name} shortDescription={p.shortDescription ?? htmlToText(p.description, 150)} seoTitle={p.seoTitle ?? ''} seoDescription={p.seoDescription ?? ''} slug={p.slug} host={host} editableSlug />
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
                  <Field label="Shop category" hint="Your own grouping, shown as a filter in your shop.">
                    <select name="categoryId" className={inputCls} defaultValue={p.categoryId ?? ''}><option value="">No category</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                  </Field>
                  <TaxonomyPicker id={p.taxonomyId} path={p.taxonomyPath ?? ''} />
                  <Field label="Product type" hint="Your own words, e.g. T-shirt."><input name="productType" defaultValue={p.productType ?? ''} maxLength={80} className={inputCls} /></Field>
                  <Field label="Vendor" hint="The brand or supplier."><input name="vendor" defaultValue={p.vendor ?? ''} maxLength={80} list="vendors" className={inputCls} /></Field>
                  <datalist id="vendors">{org.vendors.map((v) => <option key={v} value={v} />)}</datalist>
                  <Field label="Tags" hint={`Separate with commas, e.g. summer, gift. Used to search and group products.${org.tags.length ? ` Already used: ${org.tags.slice(0, 12).join(', ')}` : ''}`}><input name="tags" defaultValue={p.tags.join(', ')} maxLength={700} className={inputCls} /></Field>
                </div>
              </Card>
              <Card title="Shipping">
                <ShippingFields requiresShipping={p.requiresShipping} weightUnit={wUnit} typedIn={wUnit} originCountry={p.originCountry ?? ''} hsCode={p.hsCode ?? ''} countries={countries} />
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
        <Card title="Options and automatic variants" hint="List up to two options, one per line, like “Size: S, M, L” and “Colour: Red, Blue” (up to 100 variants). The system builds every combination as its own variant with its own SKU, price and stock. Existing variants keep their price and stock; combinations you remove are switched off, never deleted. Save your changes above first.">
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
