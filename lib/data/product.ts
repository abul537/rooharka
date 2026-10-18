import { cache } from 'react'
import { db } from '@/lib/db'
import { getCurrentStore } from '@/lib/store'

/**
 * Everything the product page needs, as PLAIN objects (no Prisma Decimals or
 * Dates) so it can be passed straight into client components.
 */

export type TrustIcon = 'truck' | 'shield' | 'leaf' | 'clock' | 'heart'

/** Per-store switches for the product page (stored in ContentBlock page="product", key="settings"). */
export interface ProductPageSettings {
  showReviews: boolean
  showFaq: boolean
  showTrustBadges: boolean
  showStickyBuyBar: boolean
  showStockCount: boolean
  lowStockThreshold: number
  maxQuantity: number
  buyButtonLabel: string
  badgeText: string | null
  guaranteeText: string | null
  trustBadges: { icon: TrustIcon; text: string }[]
}

export const DEFAULT_PRODUCT_PAGE_SETTINGS: ProductPageSettings = {
  showReviews: true,
  showFaq: true,
  showTrustBadges: true,
  showStickyBuyBar: true,
  showStockCount: true,
  lowStockThreshold: 10,
  maxQuantity: 10,
  buyButtonLabel: 'Order Now',
  badgeText: null,
  guaranteeText: null,
  trustBadges: [],
}

export interface VariantDTO {
  id: string
  label: string
  badge: string | null
  price: number
  compareAtPrice: number | null
  stock: number
  trackStock: boolean
  isDefault: boolean
}

export interface MediaDTO {
  id: string
  kind: 'IMAGE' | 'VIDEO'
  url: string
  alt: string | null
  isPrimary: boolean
}

export interface SectionItem {
  title?: string
  text?: string
}

export interface SectionDTO {
  id: string
  type: string
  tab: string | null
  tabLabel: string | null
  title: string
  items: SectionItem[]
}

export interface ReviewDTO {
  id: string
  authorName: string
  city: string | null
  rating: number
  body: string
  isVerified: boolean
  date: string
}

export interface ProductPageData {
  store: { id: string; name: string; slug: string; currency: string }
  product: {
    id: string
    slug: string
    name: string
    subtitle: string | null
    shortDescription: string | null
    description: string | null
    seoTitle: string | null
    seoDescription: string | null
  }
  variants: VariantDTO[]
  media: MediaDTO[]
  sections: SectionDTO[]
  reviews: { items: ReviewDTO[]; count: number; average: number | null }
  settings: ProductPageSettings
}

// ---------- parsing helpers (the DB stores free-form JSON, so never trust its shape) ----------

const asBool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
const asNum = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const asStr = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
const TRUST_ICONS: TrustIcon[] = ['truck', 'shield', 'leaf', 'clock', 'heart']

function parseSettings(raw: unknown): ProductPageSettings {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const d = DEFAULT_PRODUCT_PAGE_SETTINGS
  const badges = Array.isArray(o.trustBadges)
    ? o.trustBadges.flatMap((b): { icon: TrustIcon; text: string }[] => {
        const item = b as Record<string, unknown>
        const text = asStr(item?.text)
        const icon = TRUST_ICONS.includes(item?.icon as TrustIcon) ? (item.icon as TrustIcon) : 'shield'
        return text ? [{ icon, text }] : []
      })
    : d.trustBadges
  return {
    showReviews: asBool(o.showReviews, d.showReviews),
    showFaq: asBool(o.showFaq, d.showFaq),
    showTrustBadges: asBool(o.showTrustBadges, d.showTrustBadges),
    showStickyBuyBar: asBool(o.showStickyBuyBar, d.showStickyBuyBar),
    showStockCount: asBool(o.showStockCount, d.showStockCount),
    lowStockThreshold: Math.max(0, asNum(o.lowStockThreshold, d.lowStockThreshold)),
    maxQuantity: Math.min(99, Math.max(1, asNum(o.maxQuantity, d.maxQuantity))),
    buyButtonLabel: asStr(o.buyButtonLabel) ?? d.buyButtonLabel,
    badgeText: asStr(o.badgeText),
    guaranteeText: asStr(o.guaranteeText),
    trustBadges: badges,
  }
}

function parseItems(raw: unknown): SectionItem[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((i): SectionItem[] => {
    if (typeof i === 'string') return [{ text: i }]
    if (i && typeof i === 'object') {
      const o = i as Record<string, unknown>
      const title = asStr(o.title) ?? undefined
      const text = asStr(o.text) ?? undefined
      return title || text ? [{ title, text }] : []
    }
    return []
  })
}

const dec = (d: { toNumber(): number }) => d.toNumber()

// ---------- queries ----------

/** Loads one ACTIVE product of the current store with everything the page shows. */
export const getProductPageData = cache(async (slug: string): Promise<ProductPageData | null> => {
  const store = await getCurrentStore()
  if (!store) return null

  // One round of parallel queries (reviews and settings do not need the product's id first).
  const reviewWhere = { isApproved: true, product: { storeId: store.id, slug, status: 'ACTIVE' as const } }
  const [product, stats, reviews, settingsBlock] = await Promise.all([
    db.product.findFirst({
      where: { storeId: store.id, slug, status: 'ACTIVE' },
      include: {
        variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        media: { include: { media: true }, orderBy: { sortOrder: 'asc' } },
        sections: { where: { isVisible: true }, orderBy: { sortOrder: 'asc' } },
      },
    }),
    db.review.aggregate({ where: reviewWhere, _avg: { rating: true }, _count: { _all: true } }),
    db.review.findMany({ where: reviewWhere, orderBy: { createdAt: 'desc' }, take: 20 }),
    db.contentBlock.findUnique({
      where: { storeId_page_key: { storeId: store.id, page: 'product', key: 'settings' } },
      select: { data: true, isVisible: true },
    }),
  ])
  if (!product || product.variants.length === 0) return null

  return {
    store,
    product: {
      id: product.id,
      slug: product.slug,
      name: product.name,
      subtitle: product.subtitle,
      shortDescription: product.shortDescription,
      description: product.description,
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
    },
    variants: product.variants.map((v) => ({
      id: v.id,
      label: v.label,
      badge: v.badge,
      price: dec(v.price),
      compareAtPrice: v.compareAtPrice ? dec(v.compareAtPrice) : null,
      stock: v.stock,
      trackStock: v.trackStock,
      isDefault: v.isDefault,
    })),
    media: product.media.map((m) => ({
      id: m.media.id,
      kind: m.media.kind,
      url: m.media.url,
      alt: m.media.alt,
      isPrimary: m.isPrimary,
    })),
    sections: product.sections.map((s) => ({
      id: s.id,
      type: s.type,
      tab: s.tab,
      tabLabel: s.tabLabel,
      title: s.title,
      items: parseItems(s.items),
    })),
    reviews: {
      count: stats._count._all,
      average: stats._avg.rating,
      items: reviews.map((r) => ({
        id: r.id,
        authorName: r.authorName,
        city: r.city,
        rating: r.rating,
        body: r.body,
        isVerified: r.isVerified,
        date: r.createdAt.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      })),
    },
    settings: parseSettings(settingsBlock?.isVisible === false ? null : settingsBlock?.data),
  }
})

/** Slug of the store's first active product (used by the /product index). */
export async function getFirstProductSlug(): Promise<string | null> {
  const store = await getCurrentStore()
  if (!store) return null
  const p = await db.product.findFirst({
    where: { storeId: store.id, status: 'ACTIVE', variants: { some: { isActive: true } } },
    orderBy: [{ isFeatured: 'desc' }, { createdAt: 'asc' }],
    select: { slug: true },
  })
  return p?.slug ?? null
}
