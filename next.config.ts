import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // TODO: replace with your real image host (e.g. res.cloudinary.com)
      // once media storage is chosen. '**' allows ANY site through Next's
      // image optimizer, which is fine while developing but not in production.
      { protocol: 'https', hostname: '**' },
    ],
  },
}

export default nextConfig
