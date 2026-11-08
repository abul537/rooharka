import { defaultStorefront, type StorefrontContent } from '@/lib/storefront/rules'

/**
 * Starting points an owner can load from the dashboard. Each one only FILLS the editable content; the owner can
 * change every word afterwards.
 *
 *  - GENERAL: a modern multi-product shop.
 *  - SINGLE_PRODUCT (the "Darwaish" layout): the ORIGINAL model of this template, one hero product with a story,
 *    benefits and a strong call to action. Its wording is kept here so the original look is never lost.
 *    Not carried over on purpose: the made-up "only 23 left" counter and the hard-coded testimonials. Reviews on the
 *    home page now come only from real, approved customer reviews, and stock messages from real stock.
 */
export const PRESETS = {
  GENERAL: 'A modern shop with many products (recommended)',
  SINGLE_PRODUCT: 'Single hero product, the original Darwaish layout',
} as const
export type PresetKey = keyof typeof PRESETS

export function presetContent(key: PresetKey, storeName: string): StorefrontContent {
  const base = defaultStorefront(storeName)
  if (key === 'GENERAL') return base
  return {
    ...base,
    layout: 'SINGLE_PRODUCT', color: 'amber', font: 'serif', tagline: 'Sacred Oil for Muscle Revival',
    footerBlurb: 'Rooted in Sufi humility, made with herbal purity, and guided by ancestral wisdom: healing for the body and peace for the soul.',
    hero: { badge: 'Ancestral Wisdom, Modern Relief', title: storeName, subtitle: 'Sacred Oil for Muscle Revival', text: "A timeless formula gifted through generations, reviving dormant muscles and restoring your body's natural rhythm.", primaryLabel: 'Begin your revival journey', secondaryLabel: 'Discover the story', secondaryLink: '/about', imageUrl: '' },
    show: { categories: false, featured: true, story: true, benefits: true, reviews: true, faq: true, cta: true },
    trust: [
      { icon: 'leaf', title: 'Herbal purity', text: '100% natural ingredients, hand-blended in small batches.' },
      { icon: 'heart', title: 'Made with intention', text: 'Prepared with care at every step.' },
      { icon: 'truck', title: 'Delivered to your door', text: 'Cash on delivery where available.' },
      { icon: 'clock', title: 'Track your order', text: 'Follow your parcel with your tracking code.' },
    ],
    story: { title: 'A legacy of healing', text: "Passed down through generations, this is not just an oil: it's a sacred formula rooted in the belief that motion is divine, and stagnation is suffering.\n\nGifted by a wise healer, preserved with sacred knowledge, 100% natural and hand-blended with mindfulness at every step.", imageUrl: '' },
    benefits: { title: 'The sacred formula', items: ['Revives dead or weak muscles', 'Accelerates sports recovery', 'Relieves elderly joint stiffness', 'Supports post-injury therapy', 'Perfect for massage and daily care'] },
    cta: { title: 'Begin your revival journey', text: 'Order today and feel the difference. Delivered to your door.', label: 'Order now' },
    about: { title: 'Our story', body: "Passed down through generations, this formula is rooted in the belief that motion is divine, and stagnation is suffering.\n\nEvery batch is made by hand, in small quantities, with natural ingredients and careful intention." },
  }
}
