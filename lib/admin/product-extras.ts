/**
 * The "Shopify-level" parts of a product: organisation (vendor, tags), identity (SKU, barcode, page address),
 * money the customer never sees (cost, profit, margin), duplication, the product list's search/filter/sort,
 * bulk actions and the CSV export. Pure functions (no database), so every rule is unit-tested.
 */
export type R<T> = { ok: true; value: T } | { ok: false; error: string }

// ------------------------------------------------------------------ organisation
export const MAX_TAGS = 20
export const MAX_TAG_LENGTH = 30

/** "Summer, gift ,  summer" -> ["Summer", "gift"]: trimmed, no doubles (ignoring capitals), sensible limits. */
export function parseTags(raw: string): R<string[]> {
  const out: string[] = []
  const seen = new Set<string>()
  for (const part of raw.split(/[,\n]/)) {
    const t = part.trim().replace(/\s+/g, ' ')
    if (!t || seen.has(t.toLowerCase())) continue
    if (t.length > MAX_TAG_LENGTH) return { ok: false, error: `Each tag must be ${MAX_TAG_LENGTH} characters or fewer (“${t.slice(0, 20)}…” is too long).` }
    if (/[<>"]/.test(t)) return { ok: false, error: 'Tags cannot contain <, > or quotes.' }
    seen.add(t.toLowerCase()); out.push(t)
  }
  if (out.length > MAX_TAGS) return { ok: false, error: `A product can have at most ${MAX_TAGS} tags.` }
  return { ok: true, value: out }
}

export function parseVendor(raw: string): R<string | null> {
  const v = raw.trim().replace(/\s+/g, ' ')
  if (v.length > 80) return { ok: false, error: 'Vendor must be 80 characters or fewer.' }
  return { ok: true, value: v || null }
}

// ------------------------------------------------------------------ identity
export function parseSku(raw: string): R<string> {
  const sku = raw.trim().toUpperCase()
  if (!sku) return { ok: false, error: 'Every variant needs a SKU (its stock code).' }
  if (!/^[A-Z0-9_-]{1,30}$/.test(sku)) return { ok: false, error: 'SKU may contain letters, digits, - and _ only (up to 30).' }
  return { ok: true, value: sku }
}

/** The number under a barcode (EAN-8/13, UPC, or a shop's own code). Empty is fine. */
export function parseBarcode(raw: string): R<string | null> {
  const b = raw.trim()
  if (!b) return { ok: true, value: null }
  if (!/^[A-Za-z0-9-]{4,32}$/.test(b)) return { ok: false, error: 'Barcode must be 4 to 32 letters or digits (the number printed under the bars).' }
  return { ok: true, value: b }
}

export const MAX_WEIGHT_GRAMS = 1_000_000
/** Parcel weight in grams (for the courier). Empty is fine. */
export function parseWeightGrams(raw: string): R<number | null> {
  const w = raw.trim()
  if (!w) return { ok: true, value: null }
  if (!/^\d{1,7}$/.test(w) || Number(w) < 1 || Number(w) > MAX_WEIGHT_GRAMS) return { ok: false, error: 'Weight must be a whole number of grams, like 250 (1 kg = 1000).' }
  return { ok: true, value: Number(w) }
}

export function parseSlug(raw: string): R<string> {
  const s = raw.trim()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) || s.length > 60) return { ok: false, error: 'The page address may only use lowercase letters, digits and single dashes (up to 60).' }
  return { ok: true, value: s }
}

// ------------------------------------------------------------------ cost, profit, margin
/** Cost per item (what the owner pays). Paisa allowed. Empty is fine. */
export function parseCost(raw: string): R<number | null> {
  const c = raw.trim().replace(/,/g, '')
  if (!c) return { ok: true, value: null }
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(c)) return { ok: false, error: 'Cost must be an amount in rupees, like 450 or 450.50.' }
  return { ok: true, value: Number(c) }
}

/** Profit in rupees and margin as a percentage of the price (Shopify's definition). null when either number is missing. */
export function margin(price: number | null | undefined, cost: number | null | undefined): { profit: number; marginPct: number } | null {
  if (price == null || cost == null || !(price > 0)) return null
  const profit = Math.round((price - cost) * 100) / 100
  return { profit, marginPct: Math.round((profit / price) * 1000) / 10 }
}

// ------------------------------------------------------------------ duplicate
/** "Rose water" -> "Copy of Rose water" (kept within the name limit). */
export const cloneName = (name: string) => `Copy of ${name}`.slice(0, 120).trim()

/** A free SKU for the copy: ABC -> ABC-COPY, ABC-COPY2 ... (SKUs are unique inside one product; kept unique across the copy too). */
export function cloneSku(sku: string, taken: ReadonlySet<string>): string {
  const base = sku.slice(0, 24)
  for (let i = 1; i < 1000; i++) {
    const s = `${base}-COPY${i === 1 ? '' : i}`.slice(0, 30)
    if (!taken.has(s)) return s
  }
  return `${sku.slice(0, 16)}-${Date.now().toString(36).toUpperCase()}`.slice(0, 30)
}

// ------------------------------------------------------------------ the product list
export const LIST_PAGE_SIZE = 25
export const LIST_SORTS = ['newest', 'oldest', 'name', 'name-desc', 'updated'] as const
export type ListSort = (typeof LIST_SORTS)[number]
export const LIST_SORT_LABEL: Record<ListSort, string> = { newest: 'Newest first', oldest: 'Oldest first', name: 'Name A to Z', 'name-desc': 'Name Z to A', updated: 'Recently changed' }
export const LIST_STATUSES = ['ACTIVE', 'DRAFT', 'ARCHIVED'] as const
export const LIST_TYPES = ['SIMPLE', 'VARIANTS', 'MEASURABLE'] as const
export const STOCK_FILTERS = ['low', 'out'] as const
/** "Low stock" in the list means this many counted units or fewer (the same line the dashboard uses). */
export const LOW_STOCK_AT = 10

export interface ListQuery {
  q: string; status: (typeof LIST_STATUSES)[number] | null; type: (typeof LIST_TYPES)[number] | null
  categoryId: string | null; tag: string | null; stock: (typeof STOCK_FILTERS)[number] | null; sort: ListSort; page: number
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v ?? '').trim()
const pick = <T extends string>(list: readonly T[], v: string): T | null => list.find((x) => x === v) ?? null

/** Reads the address-bar filters. Anything strange becomes "no filter", never an error page. */
export function parseListQuery(sp: Record<string, string | string[] | undefined>): ListQuery {
  const page = Number.parseInt(one(sp.page), 10)
  const cat = one(sp.category)
  return {
    q: one(sp.q).slice(0, 80),
    status: pick(LIST_STATUSES, one(sp.status).toUpperCase()),
    type: pick(LIST_TYPES, one(sp.type).toUpperCase()),
    categoryId: cat === 'none' || /^[A-Za-z0-9_-]{1,40}$/.test(cat) ? cat : null,
    tag: one(sp.tag).slice(0, MAX_TAG_LENGTH) || null,
    stock: pick(STOCK_FILTERS, one(sp.stock)),
    sort: pick(LIST_SORTS, one(sp.sort)) ?? 'newest',
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
  }
}

/** The same filters back as an address, with some changed (used by the filter links and the pager). */
export function listHref(q: ListQuery, change: Partial<Record<'q' | 'status' | 'type' | 'category' | 'tag' | 'stock' | 'sort' | 'page', string | number | null>> = {}): string {
  const base: Record<string, string | number | null> = { q: q.q || null, status: q.status, type: q.type, category: q.categoryId, tag: q.tag, stock: q.stock, sort: q.sort === 'newest' ? null : q.sort, page: q.page === 1 ? null : q.page }
  // Changing a filter goes back to page 1.
  const merged = { ...base, ...('page' in change ? {} : { page: null }), ...change }
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(merged)) if (v !== null && v !== '' && !(k === 'page' && Number(v) === 1)) sp.set(k, String(v))
  const s = sp.toString()
  return s ? `/admin/products?${s}` : '/admin/products'
}

export const pageCount = (total: number, size = LIST_PAGE_SIZE) => Math.max(1, Math.ceil(total / size))

// ------------------------------------------------------------------ bulk actions
export const BULK_ACTIONS = ['activate', 'draft', 'archive', 'feature', 'unfeature', 'category', 'add-tags', 'remove-tags', 'delete'] as const
export type BulkAction = (typeof BULK_ACTIONS)[number]
export const BULK_LABEL: Record<BulkAction, string> = {
  activate: 'Set as active (live)', draft: 'Set as draft', archive: 'Archive', feature: 'Feature', unfeature: 'Stop featuring',
  category: 'Move to category…', 'add-tags': 'Add tags…', 'remove-tags': 'Remove tags…', delete: 'Delete (never-ordered products only)',
}
export const MAX_BULK = 100

export interface BulkRequest { action: BulkAction; ids: string[]; categoryId: string | null; tags: string[] }

export function parseBulk(g: { get(k: string): unknown; getAll(k: string): unknown[] }): R<BulkRequest> {
  const action = pick(BULK_ACTIONS, String(g.get('bulkAction') ?? ''))
  if (!action) return { ok: false, error: 'Choose what to do with the selected products.' }
  const ids = [...new Set(g.getAll('ids').map(String))]
  if (ids.length === 0) return { ok: false, error: 'Tick at least one product first.' }
  if (ids.length > MAX_BULK) return { ok: false, error: `Select at most ${MAX_BULK} products at a time.` }
  if (!ids.every((id) => /^[A-Za-z0-9_-]{1,40}$/.test(id))) return { ok: false, error: 'Invalid selection.' }
  let categoryId: string | null = null, tags: string[] = []
  if (action === 'category') {
    const c = String(g.get('bulkCategory') ?? '').trim()
    if (c && !/^[A-Za-z0-9_-]{1,40}$/.test(c)) return { ok: false, error: 'Invalid category.' }
    categoryId = c || null // empty = "no category"
  }
  if (action === 'add-tags' || action === 'remove-tags') {
    const t = parseTags(String(g.get('bulkTags') ?? ''))
    if (!t.ok) return t
    if (t.value.length === 0) return { ok: false, error: 'Type the tags, separated by commas.' }
    tags = t.value
  }
  return { ok: true, value: { action, ids, categoryId, tags } }
}

/** Tags after a bulk add/remove (case-insensitive, order kept, limit respected). */
export function mergeTags(current: string[], change: string[], mode: 'add' | 'remove'): string[] {
  const lower = new Set(change.map((t) => t.toLowerCase()))
  if (mode === 'remove') return current.filter((t) => !lower.has(t.toLowerCase()))
  const have = new Set(current.map((t) => t.toLowerCase()))
  return [...current, ...change.filter((t) => !have.has(t.toLowerCase()))].slice(0, MAX_TAGS)
}

// ------------------------------------------------------------------ CSV export
/**
 * One spreadsheet cell. Quotes are doubled; and a cell that starts with = + - @ gets a leading apostrophe so
 * Excel / Sheets never RUN a product name as a formula (a known way to attack whoever opens the file).
 */
export function csvCell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return ''
  let s = typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v)
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const toCsv = (header: string[], rows: (string | number | boolean | null | undefined)[][]) =>
  // The first three bytes tell Excel the file is UTF-8, so Urdu and other non-English names open correctly.
  `﻿${[header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`

export const EXPORT_HEADER = ['Product', 'Page address', 'Status', 'Type', 'Category', 'Vendor', 'Tags', 'Variant', 'SKU', 'Barcode', 'Price', 'Crossed-out price', 'Cost', 'Stock', 'Unit', 'Tracks stock', 'On sale', 'Weight (g)']
