/** Pure catalog logic (search, filter, sort, paginate, price labels). No database here, so it is fully unit-tested. */
export interface CatalogItem {
  id: string; slug: string; name: string; subtitle: string | null
  categorySlug: string | null; isFeatured: boolean; createdAt: number
  imageUrl: string | null; imageAlt: string | null
  minPrice: number; maxPrice: number
  /** Crossed-out price of the cheapest size, when it has one. */
  compareAt: number | null
  soldOut: boolean
  rating: number | null; ratingCount: number
  /** Lower-case text the search box looks through. */
  haystack: string
}

export const SORTS = ['featured', 'newest', 'price-asc', 'price-desc', 'name'] as const
export type Sort = (typeof SORTS)[number]
export const SORT_LABEL: Record<Sort, string> = {
  featured: 'Featured', newest: 'Newest', 'price-asc': 'Price: low to high', 'price-desc': 'Price: high to low', name: 'Name: A to Z',
}
export const PAGE_SIZE = 12

export interface CatalogParams { q: string; category: string | null; sort: Sort; page: number }

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/** Turns the address-bar values into safe, clean parameters (never trust them). */
export function parseCatalogParams(sp: Record<string, string | string[] | undefined>): CatalogParams {
  const q = (first(sp.q) ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
  const catRaw = (first(sp.category) ?? '').toLowerCase()
  const category = /^[a-z0-9-]{1,60}$/.test(catRaw) ? catRaw : null
  const sort = SORTS.find((s) => s === first(sp.sort)) ?? 'featured'
  const p = Number.parseInt(first(sp.page) ?? '1', 10)
  return { q, category, sort, page: Number.isInteger(p) && p >= 1 && p <= 10_000 ? p : 1 }
}

const cmp: Record<Sort, (a: CatalogItem, b: CatalogItem) => number> = {
  featured: (a, b) => Number(b.isFeatured) - Number(a.isFeatured) || b.createdAt - a.createdAt,
  newest: (a, b) => b.createdAt - a.createdAt,
  'price-asc': (a, b) => a.minPrice - b.minPrice || a.name.localeCompare(b.name),
  'price-desc': (a, b) => b.minPrice - a.minPrice || a.name.localeCompare(b.name),
  name: (a, b) => a.name.localeCompare(b.name),
}

export interface CatalogPage { items: CatalogItem[]; total: number; page: number; pages: number }

/** Filters by search words and category, sorts, and returns one page (the page number is clamped to what exists). */
export function applyCatalog(all: CatalogItem[], p: CatalogParams, pageSize = PAGE_SIZE): CatalogPage {
  const words = p.q.toLowerCase().split(' ').filter(Boolean)
  const filtered = all
    .filter((i) => (!p.category || i.categorySlug === p.category) && words.every((w) => i.haystack.includes(w)))
    .sort(cmp[p.sort])
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.min(p.page, pages)
  return { items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pages }
}

/** "20% off" for the cheapest size, or null. */
export function discountPercent(i: Pick<CatalogItem, 'minPrice' | 'compareAt'>): number | null {
  if (!i.compareAt || i.compareAt <= i.minPrice) return null
  return Math.round(((i.compareAt - i.minPrice) / i.compareAt) * 100)
}

/** Builds a /shop address that keeps the current choices and changes some of them. */
export function shopHref(p: CatalogParams, change: Partial<CatalogParams> = {}): string {
  const n = { ...p, ...change }
  const u = new URLSearchParams()
  if (n.q) u.set('q', n.q)
  if (n.category) u.set('category', n.category)
  if (n.sort !== 'featured') u.set('sort', n.sort)
  if (n.page > 1) u.set('page', String(n.page))
  const s = u.toString()
  return s ? `/shop?${s}` : '/shop'
}

/** Page numbers to show: always first and last, a window around the current one, "…" for gaps. */
export function pageWindow(page: number, pages: number): (number | '…')[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages))
  const out: (number | '…')[] = []
  let prev = 0
  for (const n of [...keep].sort((a, b) => a - b)) {
    if (n - prev > 1) out.push('…')
    out.push(n); prev = n
  }
  return out
}
