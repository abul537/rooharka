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
