import type { NextConfig } from 'next'

// Basic hardening headers for every page.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' }, // nobody may embed our pages (clickjacking)
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // TODO: replace with your real image host (e.g. res.cloudinary.com)
      // once media storage is chosen. '**' allows ANY site through Next's
      // image optimizer, which is fine while developing but not in production.
      { protocol: 'https', hostname: '**' },
    ],
  },
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
    ]
  },
}

export default nextConfig
