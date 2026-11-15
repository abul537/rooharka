/** Pure helpers for what search engines are told. */
export interface SitemapEntry { url: string; lastModified?: Date; priority: number }

/**
 * The page list of ONE shop: home, shop, About, contact, the policies that have text, every collection and every
 * live product. `origin` is the shop's own address ("https://alistore.pk"); nothing of another shop can appear,
 * because only this shop's slugs are passed in.
 */
export function shopSitemap(origin: string, d: { products: { slug: string; updatedAt?: Date }[]; collections: string[]; policies: string[] }): SitemapEntry[] {
  const at = (path: string, priority: number, lastModified?: Date): SitemapEntry => ({ url: `${origin}${path}`, priority, ...(lastModified ? { lastModified } : {}) })
  const safe = (s: string) => /^[a-z0-9-]{1,120}$/.test(s)
  return [
    at('/', 1), at('/shop', 0.9), at('/about', 0.5), at('/contact', 0.4),
    ...d.collections.filter(safe).map((h) => at(`/collections/${h}`, 0.7)),
    ...d.products.filter((p) => safe(p.slug)).slice(0, 5000).map((p) => at(`/product/${p.slug}`, 0.8, p.updatedAt)),
    ...d.policies.filter(safe).map((k) => at(`/policies/${k}`, 0.2)),
  ]
}

/**
 * SHARING PREVIEW: the title, text and picture WhatsApp, Facebook and others show when a link is shared.
 * Only an https picture is used; long text is cut so the card never looks broken.
 */
export function sharePreview(p: { siteName: string; title: string; description?: string | null; image?: string | null; url?: string | null }) {
  const cut = (v: string, max: number) => { const t = v.replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t }
  const title = cut(p.title, 90), description = p.description ? cut(p.description, 200) : undefined
  const image = p.image && /^https:\/\/[^\s"'<>]+$/.test(p.image) ? p.image : undefined
  return {
    openGraph: { type: 'website' as const, siteName: cut(p.siteName, 60), title, description, ...(p.url ? { url: p.url } : {}), ...(image ? { images: [image] } : {}) },
    twitter: { card: image ? ('summary_large_image' as const) : ('summary' as const), title, description, ...(image ? { images: [image] } : {}) },
  }
}
