import type { Getter, Parsed } from './settings-rules'
import { COUNT_UNITS, MEASURE_UNITS, getUnit, parseAmount, toBase } from '@/lib/units/registry'
import { PRODUCT_KINDS, type ProductKind } from '@/lib/units/quantity'
import { parseOptionGroups, type OptionGroup } from '@/lib/variants/rules'
import { parseBarcode, parseCost, parseSku, parseSlug, parseTags, parseVendor, parseWeightGrams } from '@/lib/admin/product-extras'

const text = (g: Getter, k: string) => String(g.get(k) ?? '').trim()
const whole = (s: string) => (/^\d{1,9}$/.test(s) ? Number(s) : null)
const decimal2 = (s: string) => (/^\d{1,9}(\.\d{1,2})?$/.test(s) ? Number(s) : null)

/** How a product is sold decides how its numbers are read: counted = whole rupees and units; measured = price per unit (paisa allowed), stock typed in that unit. */
export interface SellMeta { type: ProductKind; unitCode: string | null }
const LEGACY: SellMeta = { type: 'VARIANTS', unitCode: null }
const isMeasuredMeta = (m: SellMeta) => m.type === 'MEASURABLE'
const priceOf = (s: string, m: SellMeta) => (isMeasuredMeta(m) ? decimal2(s) : whole(s))
const priceHint = (m: SellMeta) => (isMeasuredMeta(m) ? `a number above 0 (paisa allowed) per ${m.unitCode ?? 'unit'}` : 'a whole number above 0')
const MAX_STOCK_COUNTED = 1_000_000
const MAX_STOCK_BASE = 1_000_000_000

/** Stock as typed (in the selling unit for measured products) -> the number stored (base units). null = invalid. */
export function parseStock(raw: string, m: SellMeta): number | null {
  const t = raw.trim()
  if (!isMeasuredMeta(m)) { const n = whole(t || '0'); return n !== null && n <= MAX_STOCK_COUNTED ? n : null }
  if (t === '' || /^0+([.,]0+)?$/.test(t)) return 0
  const n = parseAmount(t, m.unitCode ?? '')
  const base = n === null ? null : toBase(n, m.unitCode!)
  return base !== null && base <= MAX_STOCK_BASE ? base : null
}
const stockHint = (m: SellMeta) => (isMeasuredMeta(m) ? `a number in ${m.unitCode} (like 25 or 12.5)` : `a whole number from 0 to ${MAX_STOCK_COUNTED}`)

export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const

export interface ProductEdit {
  name: string; subtitle: string | null; shortDescription: string | null; description: string | null
  categoryId: string | null; seoTitle: string | null; seoDescription: string | null; isFeatured: boolean
  status: (typeof PRODUCT_STATUSES)[number]
  /** Present only when the form has the field (older / smaller forms leave these untouched). */
  vendor?: string | null; tags?: string[]
}

type R<T> = { ok: true; value: T } | { ok: false; error: string }

/** The shared text fields of the create and edit forms. */
function parseCommon(g: Getter): R<Omit<ProductEdit, 'status'> & { status: ProductEdit['status'] }> {
  const name = text(g, 'name')
  if (name.length < 2 || name.length > 120) return { ok: false, error: 'Product name must be 2 to 120 characters.' }
  const subtitle = text(g, 'subtitle'), shortDescription = text(g, 'shortDescription'), description = text(g, 'description')
  const seoTitle = text(g, 'seoTitle'), seoDescription = text(g, 'seoDescription'), categoryId = text(g, 'categoryId')
  if (subtitle.length > 160) return { ok: false, error: 'Subtitle must be 160 characters or fewer.' }
  if (shortDescription.length > 500) return { ok: false, error: 'Short description must be 500 characters or fewer.' }
  if (description.length > 10_000) return { ok: false, error: 'Description must be 10000 characters or fewer.' }
  if (seoTitle.length > 70) return { ok: false, error: 'Search title must be 70 characters or fewer.' }
  if (seoDescription.length > 160) return { ok: false, error: 'Search description must be 160 characters or fewer.' }
  if (categoryId && !/^[A-Za-z0-9_-]{1,40}$/.test(categoryId)) return { ok: false, error: 'Invalid category.' }
  const status = PRODUCT_STATUSES.find((x) => x === text(g, 'status'))
  if (!status) return { ok: false, error: 'Choose a status.' }
  const extra: { vendor?: string | null; tags?: string[] } = {}
  if (g.get('vendor') != null) { const v = parseVendor(text(g, 'vendor')); if (!v.ok) return v; extra.vendor = v.value }
  if (g.get('tags') != null) { const t = parseTags(text(g, 'tags')); if (!t.ok) return t; extra.tags = t.value }
  return {
    ok: true,
    value: {
      ...extra,
      name, subtitle: subtitle || null, shortDescription: shortDescription || null, description: description || null,
      categoryId: categoryId || null, seoTitle: seoTitle || null, seoDescription: seoDescription || null,
      isFeatured: g.get('isFeatured') === 'on', status,
    },
  }
}
/**
 * The unit settings that go with a product's type. Measured: the unit is fixed when the product is created (changing
 * kg to g would silently change every price), minimum and step are typed in that unit. Counted: just the unit label.
 */
function parseMeasureFields(g: Getter, meta: SellMeta, current: { qtyMin: number | null; qtyStep: number | null }): R<{ unitCode: string | null; qtyMin: number | null; qtyStep: number | null }> {
  if (meta.type === 'MEASURABLE') {
    const u = getUnit(meta.unitCode)
    if (!u || u.dimension === 'COUNT') return { ok: false, error: 'This product has no valid selling unit.' }
    const stepRaw = text(g, 'qtyStep'), minRaw = text(g, 'qtyMin')
    const step = stepRaw ? parseAmount(stepRaw, u.code) : (current.qtyStep ? current.qtyStep / u.factor : u.defaultStep)
    if (step === null) return { ok: false, error: `The order step must be a number above 0 in ${u.code}, like ${u.defaultStep}.` }
    const stepBase = toBase(step, u.code)
    if (stepBase < 1) return { ok: false, error: `The order step is too small for ${u.code}.` }
    const min = minRaw ? parseAmount(minRaw, u.code) : (current.qtyMin ? current.qtyMin / u.factor : step)
    if (min === null) return { ok: false, error: `The smallest order must be a number above 0 in ${u.code}.` }
    const minBase = toBase(min, u.code)
    if (minBase < stepBase) return { ok: false, error: 'The smallest order cannot be smaller than the order step.' }
    if ((minBase - stepBase) % stepBase !== 0) return { ok: false, error: 'The smallest order must be a whole number of steps (for example step 0.25 and smallest 0.5).' }
    return { ok: true, value: { unitCode: u.code, qtyMin: minBase, qtyStep: stepBase } }
  }
  const unit = text(g, 'unitCode')
  if (!unit) return { ok: true, value: { unitCode: meta.unitCode, qtyMin: null, qtyStep: null } } // form without the field: keep as is
  if (!COUNT_UNITS.some((u) => u.code === unit)) return { ok: false, error: 'Choose how this product is counted: piece, box, bag ...' }
  return { ok: true, value: { unitCode: unit, qtyMin: null, qtyStep: null } }
}

export interface VariantEdit {
  id: string; label: string; badge: string | null; price: number; compareAtPrice: number | null
  /** Stock the admin saw when the form opened, and the stock they typed: the DIFFERENCE is applied, so orders placed meanwhile are never lost. */
  stockWas: number; stock: number; isActive: boolean
  /** Present only when the form has the field. */
  sku?: string; barcode?: string | null; costPrice?: number | null; weightGrams?: number | null; trackStock?: boolean
}

/**
 * Parses the product form. `variantIds` are the variants that belong to this product (from the database),
 * so a tampered form cannot touch anyone else's variants.
 */
export interface ProductEditResult { product: ProductEdit; variants: VariantEdit[]; defaultId: string; unitCode: string | null; qtyMin: number | null; qtyStep: number | null; /** New page address, when the form asked to change it. */ slug?: string }

export function parseProductEdit(g: Getter, variantIds: string[], meta: SellMeta = LEGACY, current: { qtyMin: number | null; qtyStep: number | null } = { qtyMin: null, qtyStep: null }): Parsed<ProductEditResult> {
  const common = parseCommon(g)
  if (!common.ok) return common
  const status = common.value.status
  const measure = parseMeasureFields(g, meta, current)
  if (!measure.ok) return measure

  const variants: VariantEdit[] = []
  for (const id of variantIds) {
    const label = text(g, `v_${id}_label`)
    if (!label || label.length > 40) return { ok: false, error: 'Every variant needs a name of up to 40 characters.' }
    const price = priceOf(text(g, `v_${id}_price`), meta)
    if (price === null || price <= 0) return { ok: false, error: `${label}: price must be ${priceHint(meta)}.` }
    const cmpRaw = text(g, `v_${id}_compareAt`)
    const compareAtPrice = cmpRaw ? priceOf(cmpRaw, meta) : null
    if (cmpRaw && (compareAtPrice === null || compareAtPrice < price)) return { ok: false, error: `${label}: the crossed-out price must be ${priceHint(meta)} and not lower than the price.` }
    const typed = text(g, `v_${id}_stock`), stockWas = whole(text(g, `v_${id}_stockWas`))
    // Untouched field: keep the stored number exactly (a unit like tola cannot round-trip through 3 decimals).
    const stock = stockWas !== null && typed === text(g, `v_${id}_stockShown`) ? stockWas : parseStock(typed, meta)
    if (stock === null) return { ok: false, error: `${label}: stock must be ${stockHint(meta)}.` }
    const badge = text(g, `v_${id}_badge`)
    if (badge.length > 30) return { ok: false, error: `${label}: badge must be 30 characters or fewer.` }
    const more: Pick<VariantEdit, 'sku' | 'barcode' | 'costPrice' | 'weightGrams' | 'trackStock'> = {}
    if (g.get(`v_${id}_sku`) != null) { const r = parseSku(text(g, `v_${id}_sku`)); if (!r.ok) return { ok: false, error: `${label}: ${r.error}` }; more.sku = r.value }
    if (g.get(`v_${id}_barcode`) != null) { const r = parseBarcode(text(g, `v_${id}_barcode`)); if (!r.ok) return { ok: false, error: `${label}: ${r.error}` }; more.barcode = r.value }
    if (g.get(`v_${id}_cost`) != null) { const r = parseCost(text(g, `v_${id}_cost`)); if (!r.ok) return { ok: false, error: `${label}: ${r.error}` }; more.costPrice = r.value }
    if (g.get(`v_${id}_weight`) != null) { const r = parseWeightGrams(text(g, `v_${id}_weight`)); if (!r.ok) return { ok: false, error: `${label}: ${r.error}` }; more.weightGrams = r.value }
    // A checkbox that is not ticked sends nothing, so a hidden marker says "this form has the tick box".
    if (g.get(`v_${id}_trackSent`) != null) more.trackStock = g.get(`v_${id}_track`) === 'on'
    variants.push({ id, label, badge: badge || null, price, compareAtPrice, stock, stockWas: stockWas ?? stock, isActive: g.get(`v_${id}_active`) === 'on', ...more })
  }
  const skus = variants.map((v) => v.sku).filter(Boolean)
  if (new Set(skus).size !== skus.length) return { ok: false, error: 'Two variants have the same SKU. Every SKU must be different.' }
  let slug: string | undefined
  if (g.get('slug') != null) { const r = parseSlug(text(g, 'slug')); if (!r.ok) return r; slug = r.value }

  const defaultId = text(g, 'defaultVariant')
  const def = variants.find((v) => v.id === defaultId)
  if (!def) return { ok: false, error: 'Choose which variant is shown first.' }
  if (!def.isActive) return { ok: false, error: 'The variant shown first must be switched on.' }
  if (status === 'ACTIVE' && !variants.some((v) => v.isActive)) return { ok: false, error: 'A live product needs at least one variant switched on.' }
  return { ok: true, value: { product: common.value, variants, defaultId, ...measure.value, ...(slug ? { slug } : {}) } }
}


// ----------------------------------------------------------------------------- create
/** "Darwaish Sacred Oil!" -> "darwaish-sacred-oil". Non-latin names fall back to "product". */
export function slugify(name: string): string {
  const s = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '')
  return s || 'product'
}
/** First free slug among base, base-2, base-3 ... */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  for (let i = 2; i < 10_000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`
  return `${base}-${Date.now()}`
}

export interface NewVariant { label: string; badge: string | null; sku: string; price: number; compareAtPrice: number | null; stock: number; barcode?: string | null; costPrice?: number | null; weightGrams?: number | null; trackStock?: boolean }

/** Reads one variant from a form; `prefix` lets the same code read "first variant" and "add variant" forms. */
export function parseVariantFields(g: Getter, prefix = '', meta: SellMeta = LEGACY, defaultLabel?: string): R<NewVariant> {
  const label = text(g, `${prefix}label`) || defaultLabel || ''
  if (!label || label.length > 40) return { ok: false, error: 'Give the variant a name of up to 40 characters, e.g. “100ml”.' }
  const price = priceOf(text(g, `${prefix}price`), meta)
  if (price === null || price <= 0) return { ok: false, error: `Price must be ${priceHint(meta)}.` }
  const cmpRaw = text(g, `${prefix}compareAt`)
  const compareAtPrice = cmpRaw ? priceOf(cmpRaw, meta) : null
  if (cmpRaw && (compareAtPrice === null || compareAtPrice < price)) return { ok: false, error: `The crossed-out price must be ${priceHint(meta)} and not lower than the price.` }
  const stock = parseStock(text(g, `${prefix}stock`), meta)
  if (stock === null) return { ok: false, error: `Stock must be ${stockHint(meta)}.` }
  const badge = text(g, `${prefix}badge`)
  if (badge.length > 30) return { ok: false, error: 'Badge must be 30 characters or fewer.' }
  const sku = text(g, `${prefix}sku`).toUpperCase()
  if (sku && !/^[A-Z0-9_-]{1,30}$/.test(sku)) return { ok: false, error: 'SKU may contain letters, digits, - and _ only.' }
  const barcode = parseBarcode(text(g, `${prefix}barcode`)); if (!barcode.ok) return barcode
  const cost = parseCost(text(g, `${prefix}cost`)); if (!cost.ok) return cost
  const weight = parseWeightGrams(text(g, `${prefix}weight`)); if (!weight.ok) return weight
  return { ok: true, value: { label, badge: badge || null, sku, price, compareAtPrice, stock, barcode: barcode.value, costPrice: cost.value, weightGrams: weight.value, ...(g.get(`${prefix}trackSent`) != null ? { trackStock: g.get(`${prefix}track`) === 'on' } : {}) } }
}

export interface NewProduct {
  product: ProductEdit; slug: string
  type: ProductKind; unitCode: string | null; qtyMin: number | null; qtyStep: number | null
  /** VARIANTS with options: every combination is created from this one template. Empty = a single variant. */
  optionGroups: OptionGroup[]
  variant: NewVariant
}

export function parseNewProduct(g: Getter): R<NewProduct> {
  const common = parseCommon(g)
  if (!common.ok) return common
  const type = PRODUCT_KINDS.find((t) => t === text(g, 'type')) ?? 'VARIANTS'
  const unitRaw = text(g, 'unitCode')

  let unitCode: string | null = null
  if (type === 'MEASURABLE') {
    const u = MEASURE_UNITS.find((x) => x.code === unitRaw)
    if (!u) return { ok: false, error: 'Choose the unit this product is sold by: kg, g, litre, metre ...' }
    unitCode = u.code
  } else if (unitRaw) {
    if (!COUNT_UNITS.some((u) => u.code === unitRaw)) return { ok: false, error: 'Choose how this product is counted: piece, box, bag ...' }
    unitCode = unitRaw
  } else if (type === 'SIMPLE') unitCode = 'piece'
  const meta: SellMeta = { type, unitCode }

  let optionGroups: OptionGroup[] = []
  if (type === 'VARIANTS') {
    const og = parseOptionGroups(String(g.get('options') ?? ''))
    if (!og.ok) return og
    optionGroups = og.value
  }
  const variant = parseVariantFields(g, 'v_', meta, optionGroups.length || type !== 'VARIANTS' ? 'Standard' : undefined)
  if (!variant.ok) return variant
  const measure = parseMeasureFields(g, meta, { qtyMin: null, qtyStep: null })
  if (!measure.ok) return measure

  const slugRaw = text(g, 'slug')
  if (slugRaw && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugRaw)) return { ok: false, error: 'The page address may only use lowercase letters, digits and single dashes.' }
  if (slugRaw.length > 60) return { ok: false, error: 'The page address must be 60 characters or fewer.' }
  return { ok: true, value: { product: common.value, slug: slugRaw || slugify(common.value.name), type, unitCode: measure.value.unitCode ?? unitCode, qtyMin: measure.value.qtyMin, qtyStep: measure.value.qtyStep, optionGroups, variant: variant.value } }
}

// --------------------------------------------------------------------- page sections
export const SECTION_TYPES = ['CHECKLIST', 'BULLETS', 'STEPS', 'CARDS', 'FAQ', 'KEY_BENEFITS'] as const
export type SectionType = (typeof SECTION_TYPES)[number]
export const SECTION_TYPE_LABEL: Record<SectionType, string> = {
  CHECKLIST: 'Checklist (ticks)', BULLETS: 'Bullet list', STEPS: 'Numbered steps', CARDS: 'Cards (title + text)', FAQ: 'Questions and answers', KEY_BENEFITS: 'Key benefits (title + text)',
}
/** These types need "title | text" lines; the others need one line per item. */
export const PAIR_TYPES: readonly SectionType[] = ['CARDS', 'FAQ', 'KEY_BENEFITS']
export interface SectionItem { title?: string; text?: string }
export interface SectionEdit { type: SectionType; tab: string | null; tabLabel: string | null; title: string; items: SectionItem[]; isVisible: boolean }

export function parseSectionItems(type: SectionType, raw: string): SectionItem[] {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 40)
  if (!PAIR_TYPES.includes(type)) return lines.map((text) => ({ text: text.slice(0, 500) }))
  return lines.map((l) => {
    const i = l.indexOf('|')
    return i < 0 ? { title: l.slice(0, 160) } : { title: l.slice(0, i).trim().slice(0, 160), text: l.slice(i + 1).trim().slice(0, 1000) }
  })
}
export function sectionItemsToText(type: SectionType, items: SectionItem[]): string {
  return items.map((i) => (PAIR_TYPES.includes(type) ? [i.title ?? '', i.text ?? ''].filter(Boolean).join(' | ') : i.text ?? i.title ?? '')).join('\n')
}

/**
 * Reads the sections form. Slots are s0..s{count-1}. A slot is dropped when "remove" is ticked or when it is
 * completely empty; a half-filled slot (items but no title, or the reverse) is an error the owner can fix.
 */
export function parseSections(g: Getter, count: number): R<SectionEdit[]> {
  const out: SectionEdit[] = []
  for (let i = 0; i < Math.min(count, 30); i++) {
    const title = text(g, `s${i}_title`), rawItems = String(g.get(`s${i}_items`) ?? '')
    if (g.get(`s${i}_remove`) === 'on' || (!title && !rawItems.trim())) continue
    const type = SECTION_TYPES.find((t) => t === text(g, `s${i}_type`))
    if (!type) return { ok: false, error: `Section ${i + 1}: choose a type.` }
    if (!title || title.length > 120) return { ok: false, error: `Section ${i + 1}: give it a heading of up to 120 characters.` }
    const items = parseSectionItems(type, rawItems)
    if (items.length === 0) return { ok: false, error: `Section “${title}” needs at least one line of content (or tick Remove).` }
    const tab = text(g, `s${i}_tab`).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30)
    const tabLabel = text(g, `s${i}_tabLabel`)
    if (tabLabel.length > 30) return { ok: false, error: `Section “${title}”: tab name must be 30 characters or fewer.` }
    out.push({ type, tab: tab || null, tabLabel: tabLabel || null, title, items, isVisible: g.get(`s${i}_visible`) === 'on' })
  }
  return { ok: true, value: out }
}
