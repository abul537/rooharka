import type { Getter, Parsed } from './settings-rules'

const text = (g: Getter, k: string) => String(g.get(k) ?? '').trim()
const whole = (s: string) => (/^\d{1,9}$/.test(s) ? Number(s) : null)

export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const

export interface ProductEdit {
  name: string; subtitle: string | null; shortDescription: string | null; description: string | null
  categoryId: string | null; seoTitle: string | null; seoDescription: string | null; isFeatured: boolean
  status: (typeof PRODUCT_STATUSES)[number]
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
  return {
    ok: true,
    value: {
      name, subtitle: subtitle || null, shortDescription: shortDescription || null, description: description || null,
      categoryId: categoryId || null, seoTitle: seoTitle || null, seoDescription: seoDescription || null,
      isFeatured: g.get('isFeatured') === 'on', status,
    },
  }
}
export interface VariantEdit {
  id: string; label: string; badge: string | null; price: number; compareAtPrice: number | null
  /** Stock the admin saw when the form opened, and the stock they typed: the DIFFERENCE is applied, so orders placed meanwhile are never lost. */
  stockWas: number; stock: number; isActive: boolean
}

/**
 * Parses the product form. `variantIds` are the variants that belong to this product (from the database),
 * so a tampered form cannot touch anyone else's variants.
 */
export function parseProductEdit(g: Getter, variantIds: string[]): Parsed<{ product: ProductEdit; variants: VariantEdit[]; defaultId: string }> {
  const common = parseCommon(g)
  if (!common.ok) return common
  const status = common.value.status

  const variants: VariantEdit[] = []
  for (const id of variantIds) {
    const label = text(g, `v_${id}_label`)
    if (!label || label.length > 40) return { ok: false, error: 'Every size needs a name of up to 40 characters.' }
    const price = whole(text(g, `v_${id}_price`))
    if (price === null || price < 1) return { ok: false, error: `${label}: price must be a whole number above 0.` }
    const cmpRaw = text(g, `v_${id}_compareAt`)
    const compareAtPrice = cmpRaw ? whole(cmpRaw) : null
    if (cmpRaw && (compareAtPrice === null || compareAtPrice < price)) return { ok: false, error: `${label}: the crossed-out price must be a whole number not lower than the price.` }
    const stock = whole(text(g, `v_${id}_stock`)), stockWas = whole(text(g, `v_${id}_stockWas`))
    if (stock === null || stock > 1_000_000) return { ok: false, error: `${label}: stock must be a whole number from 0 to 1000000.` }
    const badge = text(g, `v_${id}_badge`)
    if (badge.length > 30) return { ok: false, error: `${label}: badge must be 30 characters or fewer.` }
    variants.push({ id, label, badge: badge || null, price, compareAtPrice, stock, stockWas: stockWas ?? stock, isActive: g.get(`v_${id}_active`) === 'on' })
  }

  const defaultId = text(g, 'defaultVariant')
  const def = variants.find((v) => v.id === defaultId)
  if (!def) return { ok: false, error: 'Choose which size is shown first.' }
  if (!def.isActive) return { ok: false, error: 'The size shown first must be switched on.' }
  if (status === 'ACTIVE' && !variants.some((v) => v.isActive)) return { ok: false, error: 'A live product needs at least one size switched on.' }
  return { ok: true, value: { product: common.value, variants, defaultId } }
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

export interface NewVariant { label: string; badge: string | null; sku: string; price: number; compareAtPrice: number | null; stock: number }

/** Reads one size from a form; `prefix` lets the same code read "first size" and "add size" forms. */
export function parseVariantFields(g: Getter, prefix = ''): R<NewVariant> {
  const label = text(g, `${prefix}label`)
  if (!label || label.length > 40) return { ok: false, error: 'Give the size a name of up to 40 characters, e.g. “100ml”.' }
  const price = whole(text(g, `${prefix}price`))
  if (price === null || price < 1) return { ok: false, error: 'Price must be a whole number above 0.' }
  const cmpRaw = text(g, `${prefix}compareAt`)
  const compareAtPrice = cmpRaw ? whole(cmpRaw) : null
  if (cmpRaw && (compareAtPrice === null || compareAtPrice < price)) return { ok: false, error: 'The crossed-out price must be a whole number not lower than the price.' }
  const stock = whole(text(g, `${prefix}stock`) || '0')
  if (stock === null || stock > 1_000_000) return { ok: false, error: 'Stock must be a whole number from 0 to 1000000.' }
  const badge = text(g, `${prefix}badge`)
  if (badge.length > 30) return { ok: false, error: 'Badge must be 30 characters or fewer.' }
  const sku = text(g, `${prefix}sku`).toUpperCase()
  if (sku && !/^[A-Z0-9_-]{1,30}$/.test(sku)) return { ok: false, error: 'SKU may contain letters, digits, - and _ only.' }
  return { ok: true, value: { label, badge: badge || null, sku, price, compareAtPrice, stock } }
}

export interface NewProduct { product: ProductEdit; slug: string; variant: NewVariant }

export function parseNewProduct(g: Getter): R<NewProduct> {
  const common = parseCommon(g)
  if (!common.ok) return common
  const variant = parseVariantFields(g, 'v_')
  if (!variant.ok) return variant
  const slugRaw = text(g, 'slug')
  if (slugRaw && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugRaw)) return { ok: false, error: 'The page address may only use lowercase letters, digits and single dashes.' }
  if (slugRaw.length > 60) return { ok: false, error: 'The page address must be 60 characters or fewer.' }
  return { ok: true, value: { product: common.value, slug: slugRaw || slugify(common.value.name), variant: variant.value } }
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
