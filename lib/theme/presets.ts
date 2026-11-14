/**
 * Starter designs. Each is only a starting point made from the same section library as everything else: a set of
 * sections for the Home and About pages plus colours, font and corners. The owner can change every part afterwards.
 * They are JSON templates, not separate themes with their own code.
 */
import { defaultStorefront } from '@/lib/storefront/rules'
import { presetContent } from '@/lib/storefront/presets'
import { aboutFromLegacy, readTemplate, templateFromLegacy, type Template, type TemplateType } from '@/lib/theme/schema'
import type { ThemeSettings } from '@/lib/theme/settings'

export const THEME_PRESETS = {
  minimal: { name: 'Minimal', description: 'Calm and simple: a centred welcome, your newest products, real reviews and one closing banner.' },
  editorial: { name: 'Editorial', description: 'Magazine style: a wide picture hero, your story beside a picture, a masonry gallery and classic serif headings.' },
  bold: { name: 'Bold', description: 'Loud and promotional: slides up top, a promo strip, categories, a row of products to swipe and round buttons.' },
  spotlight: { name: 'Spotlight', description: 'Built around one hero product with a story and benefits (the original Darwaish design).' },
} as const
export type ThemePresetKey = keyof typeof THEME_PRESETS
export interface ThemePreset { settings: ThemeSettings; home: Template; about: Template; product: Template; collection: Template }

const page = (sections: object[], type: TemplateType = 'home'): Template => readTemplate({ sections }, type)

function basePreset(key: ThemePresetKey, storeName: string): Pick<ThemePreset, 'settings' | 'home' | 'about'> {
  const base = defaultStorefront(storeName)
  const about = aboutFromLegacy(base, storeName)
  const faq = { id: 'faq-1', type: 'faq', settings: { title: 'Questions, answered', layout: 'one' }, blocks: base.faq.map((f, i) => ({ id: `b${i + 1}`, settings: f })) }
  const highlights = { id: 'highlights-1', type: 'highlights', blocks: base.trust.map((t, i) => ({ id: `b${i + 1}`, settings: { ...t } })) }

  if (key === 'spotlight') {
    const c = presetContent('SINGLE_PRODUCT', storeName)
    return { settings: { color: 'amber', customColor: '', font: 'serif', corners: 'soft' }, home: templateFromLegacy(c), about: aboutFromLegacy(c, storeName) }
  }
  if (key === 'minimal') {
    return {
      settings: { color: 'slate', customColor: '', font: 'sans', corners: 'sharp' }, about,
      home: page([
        { id: 'hero-1', type: 'hero', settings: { layout: 'centered', title: base.hero.title, text: base.hero.text, primaryLabel: 'Shop now', primaryLink: '/shop' } },
        { id: 'product-grid-1', type: 'product-grid', settings: { title: 'New in', layout: 'grid-4', source: 'newest', count: '8', viewAll: true } },
        { id: 'reviews-1', type: 'reviews', settings: { title: 'What our customers say', layout: 'single' } },
        { id: 'cta-1', type: 'cta', settings: { layout: 'centered', title: base.cta.title, text: base.cta.text, label: base.cta.label, link: '/shop' } },
      ]),
    }
  }
  if (key === 'editorial') {
    return {
      settings: { color: 'rose', customColor: '', font: 'serif', corners: 'soft' },
      home: page([
        { id: 'hero-1', type: 'hero', settings: { layout: 'full-bleed', ratio: '21:9', title: base.hero.title, text: base.hero.text, primaryLabel: 'Explore the shop', primaryLink: '/shop' } },
        { id: 'story-1', type: 'story', settings: { layout: 'split', title: `The ${storeName} story`, text: 'Tell customers who you are, how your products are made and why you care. Two or three short paragraphs are enough.', imageSide: 'right', ratio: '4:5', buttonLabel: 'More about us', buttonLink: '/about' } },
        { id: 'product-grid-1', type: 'product-grid', settings: { title: 'Selected for you', layout: 'grid-3', source: 'featured', count: '6', viewAll: true } },
        { id: 'gallery-1', type: 'gallery', settings: { title: 'From our studio', layout: 'masonry', ratio: '4:5' } },
        { id: 'reviews-1', type: 'reviews', settings: { title: 'In their words', layout: 'cards' } },
        { id: 'cta-1', type: 'cta', settings: { layout: 'centered', title: 'Stay in touch', text: 'Leave your email to hear about new arrivals first.', signup: true } },
      ]),
      about: page([
        { id: 'hero-1', type: 'hero', settings: { layout: 'image-right', title: base.about.title, text: 'A few words about who we are.', primaryLabel: '', showRating: false } },
        { id: 'story-1', type: 'story', settings: { layout: 'timeline', title: 'How we got here', text: '' }, blocks: [{ id: 'b1', settings: { title: 'Where it started', text: 'Write the first step of your story here.' } }, { id: 'b2', settings: { title: 'Where we are now', text: 'And what you do today.' } }] },
        { id: 'gallery-1', type: 'gallery', settings: { title: 'Behind the scenes', layout: 'grid-3', ratio: '1:1' } },
        { id: 'cta-1', type: 'cta', settings: { layout: 'centered', title: 'Have a look around', label: 'Visit the shop', link: '/shop' } },
      ]),
    }
  }
  return { // bold
    settings: { color: 'indigo', customColor: '', font: 'sans', corners: 'round' }, about,
    home: page([
      { id: 'hero-1', type: 'hero', settings: { layout: 'image-left', badge: 'New season', title: base.hero.title, text: base.hero.text, primaryLabel: 'Shop the sale', primaryLink: '/shop', secondaryLabel: 'Our story', secondaryLink: '/about' } },
      { id: 'banner-1', type: 'banner', settings: { layout: 'strip', title: 'Cash on delivery across Pakistan', text: 'Order today, pay when it arrives.', label: 'Shop now', link: '/shop' } },
      highlights,
      { id: 'category-list-1', type: 'category-list', settings: { title: 'Shop by category', columns: '3' } },
      { id: 'product-grid-1', type: 'product-grid', settings: { title: 'Best sellers', layout: 'carousel', source: 'featured', count: '12', viewAll: true } },
      { id: 'reviews-1', type: 'reviews', settings: { title: 'Loved by customers', layout: 'carousel' } },
      faq,
      { id: 'cta-1', type: 'cta', settings: { layout: 'centered', title: base.cta.title, text: base.cta.text, label: base.cta.label, link: '/shop' } },
    ]),
  }
}

/** How each starter design sets up the product and collection pages: the same sections, different layouts. */
const SHOP_PAGES: Record<ThemePresetKey, { main: object; info: object; related: object; collection: object }> = {
  minimal: { main: { layout: 'media-left', ratio: '1:1', background: 'plain' }, info: { layout: 'stacked' }, related: { layout: 'grid-4', count: '4' }, collection: { layout: 'left', columns: '4', background: 'plain' } },
  editorial: { main: { layout: 'media-left', ratio: '4:5', background: 'tint' }, info: { layout: 'accordion' }, related: { layout: 'grid-3', count: '3' }, collection: { layout: 'centered', columns: '3', background: 'tint' } },
  bold: { main: { layout: 'media-right', ratio: '1:1', background: 'tint' }, info: { layout: 'tabs' }, related: { layout: 'carousel', count: '8' }, collection: { layout: 'centered', columns: '4', background: 'tint', count: true } },
  spotlight: { main: {}, info: {}, related: {}, collection: {} },
}

export function themePreset(key: ThemePresetKey, storeName: string): ThemePreset {
  const v = SHOP_PAGES[key]
  return {
    ...basePreset(key, storeName),
    product: page([
      { id: 'product-main-1', type: 'product-main', settings: v.main }, { id: 'product-info-1', type: 'product-info', settings: v.info },
      { id: 'product-faq-1', type: 'product-faq' }, { id: 'related-products-1', type: 'related-products', settings: { title: 'You may also like', ...v.related } },
    ], 'product'),
    collection: page([{ id: 'collection-main-1', type: 'collection-main', settings: v.collection }], 'collection'),
  }
}
