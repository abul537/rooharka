import type { NextConfig } from 'next'

// Basic hardening headers for every page.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' }, // nobody may embed our pages (clickjacking)
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // A content security policy for the things that can be locked without touching scripts: nobody may frame our
  // pages, change where links resolve (<base>), post our forms to another site, or load plugins.
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  // Live sites only: browsers remember for a year to use https and never plain http (not sent in development).
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
]

// The platform's own web addresses (PLATFORM_HOST="rooharka.pk"): the home page there is the public sign-up site, not a shop.
// Read at build/start time; the alias imports used elsewhere are not available in this file, so the parsing is repeated here.
const platformHosts = (process.env.PLATFORM_HOST ?? '').split(',').map((h) => h.trim().toLowerCase().replace(/:\d+$/, '')).filter(Boolean)

// The first store's own shop address (DEFAULT_STORE_HOST="mppmhk.vercel.app"). When it is set, the platform's address
// keeps ONLY the public site and the dashboards: a shop page opened there (an old link, a bookmark) is sent to the same
// page on the shop's address, so the shop's Home button and every other shop link always stay inside the shop.
const shopHost = (process.env.DEFAULT_STORE_HOST ?? '').trim().toLowerCase().replace(/:\d+$/, '')
const SHOP_PAGES = 'shop|about|cart|checkout|collections|contact|policies|product|track|verify' // the folders of app/(shop)
const hostRule = (h: string) => [{ type: 'host' as const, value: h.replace(/\./g, '\\.') }]

const nextConfig: NextConfig = {
  async redirects() {
    if (!shopHost || platformHosts.some((h) => h === shopHost || `www.${h}` === shopHost)) return []
    // Two rules per address: "/shop" itself, and anything below it ("/product/abc"), so no trailing "/" is ever added.
    // permanent: false = browsers must not remember it; the shop may move to its own domain later.
    return platformHosts.flatMap((h) => [h, `www.${h}`]).flatMap((h) => [
      { source: `/:page(${SHOP_PAGES})`, has: hostRule(h), destination: `https://${shopHost}/:page`, permanent: false },
      { source: `/:page(${SHOP_PAGES})/:rest+`, has: hostRule(h), destination: `https://${shopHost}/:page/:rest+`, permanent: false },
    ])
  },
  async rewrites() {
    return {
      beforeFiles: platformHosts.flatMap((h) => [h, `www.${h}`]).map((h) => ({
        source: '/', has: hostRule(h), destination: '/platform',
      })),
      afterFiles: [], fallback: [],
    }
  },
  // Photos are served unoptimized from their own host (see components/media/MediaImage.tsx), so no image hosts need allowing.
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // The dashboard must never be cached or indexed.
      {
        source: '/admin/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      // Same for the platform owner's dashboard (CSMI).
      {
        source: '/csmi/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ]
  },
}

export default nextConfig
