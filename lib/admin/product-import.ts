/**
 * PRODUCT IMPORT from a spreadsheet (CSV): the rules, pure and unit-tested.
 *
 * The file has the same columns as the export (Products, "Export"), so the easy way is: export, edit in Excel or
 * Google Sheets, import. For each row:
 *   - a SKU the store already has  -> that variant's price, crossed-out price, cost, stock and on-sale switch are updated;
 *   - a new SKU (or none)          -> a NEW product is made from the rows that share a product name, as a DRAFT,
 *                                     so nothing appears in the shop until the owner has looked at it.
 * Nothing is ever deleted by an import. Every row is checked first; the owner sees the plan before anything is saved.
 */
import { slugify } from '@/lib/admin/slug'

export const IMPORT_MAX_BYTES = 1_000_000
export const IMPORT_MAX_ROWS = 2000

/** Reads CSV text into rows of cells. Handles quotes, commas and line breaks inside quotes, and Excel's BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++ } else quoted = false } else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = [] }
    else cell += c
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim() !== ''))
}

const COLUMNS = { product: ['product', 'name', 'title'], status: ['status'], category: ['category'], vendor: ['vendor', 'brand'], tags: ['tags'], variant: ['variant', 'option', 'size'], sku: ['sku'], barcode: ['barcode'], price: ['price'], compare: ['crossed-out price', 'compare at price', 'old price'], cost: ['cost'], stock: ['stock', 'quantity'], onSale: ['on sale', 'active'] } as const
type Col = keyof typeof COLUMNS
export interface ExistingVariant { id: string; productId: string; sku: string; price: number; stock: number; measured: boolean; label: string; productName: string }
export interface VariantUpdate { id: string; productId: string; sku: string; label: string; data: { price?: number; compareAtPrice?: number | null; costPrice?: number | null; isActive?: boolean }; stockDelta: number }
export interface NewVariantRow { label: string; sku: string | null; barcode: string | null; price: number; compareAtPrice: number | null; costPrice: number | null; stock: number; isActive: boolean }
export interface NewProductPlan { name: string; slug: string; category: string | null; vendor: string | null; tags: string[]; variants: NewVariantRow[] }
export interface ImportPlan { updates: VariantUpdate[]; creates: NewProductPlan[]; problems: string[]; unchanged: number }

/** A formula typed into a cell must never be stored as text that Excel later runs: a leading = + - @ is cut off. */
const clean = (v: string | undefined, max: number) => (v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[=+\-@]+\s*/, '').slice(0, max)
const money = (v: string | undefined): number | null | 'bad' => { const t = (v ?? '').replace(/[,\s]|rs\.?|pkr/gi, ''); if (t === '') return null; return /^\d{1,8}(\.\d{1,2})?$/.test(t) ? Number(t) : 'bad' }
const whole = (v: string | undefined): number | null | 'bad' => { const t = (v ?? '').replace(/[,\s]/g, ''); if (t === '') return null; return /^\d{1,7}$/.test(t) ? Number(t) : 'bad' }
const yesNo = (v: string | undefined): boolean | null => { const t = (v ?? '').trim().toLowerCase(); return ['true', 'yes', 'y', '1', 'on'].includes(t) ? true : ['false', 'no', 'n', '0', 'off'].includes(t) ? false : null }

/**
 * Works out what an import WOULD do, without touching anything. `existing` = the store's variants by SKU (upper case).
 * Problems are per row, in words the owner can act on; a row with a problem is left out, the rest still goes ahead.
 */
export function planImport(text: string, existing: ReadonlyMap<string, ExistingVariant>): ImportPlan {
  const plan: ImportPlan = { updates: [], creates: [], problems: [], unchanged: 0 }
  if (text.length > IMPORT_MAX_BYTES) return { ...plan, problems: ['The file is larger than 1 MB. Split it into smaller files.'] }
  const rows = parseCsv(text)
  if (rows.length < 2) return { ...plan, problems: ['The file has no rows under its heading row.'] }
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const at = Object.fromEntries((Object.keys(COLUMNS) as Col[]).map((k) => [k, head.findIndex((h) => (COLUMNS[k] as readonly string[]).includes(h))])) as Record<Col, number>
  if (at.sku < 0 && at.product < 0) return { ...plan, problems: ['The first row must name the columns. At least “SKU” (to update products) or “Product” (to add new ones) is needed. The easiest start is the file from Export.'] }
  if (rows.length - 1 > IMPORT_MAX_ROWS) return { ...plan, problems: [`The file has ${rows.length - 1} rows; at most ${IMPORT_MAX_ROWS} can be imported at once.`] }

  const fresh = new Map<string, NewProductPlan>(), seenSku = new Set<string>()
  rows.slice(1).forEach((r, i) => {
    const n = i + 2, get = (k: Col) => (at[k] >= 0 ? r[at[k]] : undefined)
    const bad = (why: string) => { plan.problems.push(`Row ${n}: ${why}`) }
    const sku = clean(get('sku'), 40).toUpperCase()
    if (sku && !/^[A-Z0-9._-]{1,40}$/.test(sku)) return bad('the SKU may only have letters, digits, dots and dashes.')
    if (sku && seenSku.has(sku)) return bad(`the SKU ${sku} appears twice in the file.`)
    if (sku) seenSku.add(sku)
    const price = money(get('price')), compare = money(get('compare')), cost = money(get('cost')), stock = whole(get('stock')), onSale = yesNo(get('onSale'))
    if (price === 'bad') return bad('the price is not a number.')
    if (compare === 'bad') return bad('the crossed-out price is not a number.')
    if (cost === 'bad') return bad('the cost is not a number.')
    if (stock === 'bad') return bad('the stock must be a whole number.')
    if (price !== null && price <= 0) return bad('the price must be more than zero.')
    if (price !== null && compare !== null && compare <= price) return bad('the crossed-out price must be higher than the price (or empty).')

    const old = sku ? existing.get(sku) : undefined
    if (old) {
      const data: VariantUpdate['data'] = {}
      if (price !== null && price !== old.price) data.price = price
      if (compare !== null && compare <= (price ?? old.price)) return bad('the crossed-out price must be higher than the price (or empty).')
      if (compare !== null) data.compareAtPrice = compare
      if (at.cost >= 0 && cost !== null) data.costPrice = cost
      if (onSale !== null) data.isActive = onSale
      if (old.measured && stock !== null && stock !== old.stock) plan.problems.push(`Row ${n}: ${sku} is sold by weight or length; change its stock in the dashboard. Its other columns were used.`)
      const stockDelta = !old.measured && stock !== null ? stock - old.stock : 0
      if (Object.keys(data).length === 0 && stockDelta === 0) { plan.unchanged++; return }
      plan.updates.push({ id: old.id, productId: old.productId, sku, label: `${old.productName} (${old.label})`, data, stockDelta })
      return
    }
    // A new product (or a new variant of a product being created in this same file).
    const name = clean(get('product'), 120)
    if (!name) return bad(sku ? `the SKU ${sku} is not in your shop, and the row has no product name to create it from.` : 'the row has neither a SKU of your shop nor a product name.')
    if (price === null) return bad('a new product needs a price.')
    const key = name.toLowerCase()
    if (!fresh.has(key)) {
      const slug = slugify(name)
      if (!slug) return bad('the product name must contain letters or digits.')
      fresh.set(key, { name, slug, category: clean(get('category'), 60) || null, vendor: clean(get('vendor'), 60) || null, tags: clean(get('tags'), 400).split(',').map((t) => t.trim()).filter(Boolean).slice(0, 20).map((t) => t.slice(0, 30)), variants: [] })
    }
    const p = fresh.get(key)!
    if (p.variants.length >= 100) return bad('a product can have at most 100 variants.')
    const label = clean(get('variant'), 60) || (p.variants.length === 0 ? 'Default' : `Option ${p.variants.length + 1}`)
    if (p.variants.some((v) => v.label.toLowerCase() === label.toLowerCase())) return bad(`“${name}” already has a variant called “${label}” in this file.`)
    p.variants.push({ label, sku: sku || null, barcode: clean(get('barcode'), 32) || null, price, compareAtPrice: compare, costPrice: cost, stock: stock ?? 0, isActive: onSale ?? true })
  })
  plan.creates = [...fresh.values()]
  plan.problems = plan.problems.slice(0, 100)
  return plan
}
/** One sentence for the owner: what the file will do. */
export function describePlan(p: ImportPlan): string {
  const parts = [p.updates.length ? `${p.updates.length} variant${p.updates.length === 1 ? '' : 's'} will be updated` : '', p.creates.length ? `${p.creates.length} new product${p.creates.length === 1 ? '' : 's'} will be added as drafts` : '', p.unchanged ? `${p.unchanged} row${p.unchanged === 1 ? ' is' : 's are'} already up to date` : ''].filter(Boolean)
  return parts.length ? `${parts.join(', ')}.` : 'Nothing in this file would change your products.'
}
