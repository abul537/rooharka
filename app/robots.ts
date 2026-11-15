import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'

/**
 * /robots.txt for whichever address is asked (a shop's own domain, or the platform's): search engines may read
 * the public pages, never the dashboards, the checkout or a customer's tracking page, and are told where the
 * page list (sitemap) is.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = ((await headers()).get('host') ?? '').toLowerCase()
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/csmi', '/api/', '/checkout', '/cart', '/verify', '/track'] }],
    ...(host ? { sitemap: `https://${host}/sitemap.xml` } : {}),
  }
}
