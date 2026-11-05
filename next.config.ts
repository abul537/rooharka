import type { NextConfig } from 'next'

// Basic hardening headers for every page.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' }, // nobody may embed our pages (clickjacking)
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

// The platform's own web addresses (PLATFORM_HOST="rooharka.pk"): the home page there is the public sign-up site, not a shop.
// Read at build/start time; the alias imports used elsewhere are not available in this file, so the parsing is repeated here.
const platformHosts = (process.env.PLATFORM_HOST ?? '').split(',').map((h) => h.trim().toLowerCase().replace(/:\d+$/, '')).filter(Boolean)

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: platformHosts.flatMap((h) => [h, `www.${h}`]).map((h) => ({
        source: '/', has: [{ type: 'host' as const, value: h.replace(/\./g, '\\.') }], destination: '/platform',
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
