/**
 * Ready-made themes an owner can start from. Each is only a starting point: every section, word and colour can be
 * changed afterwards. They are built from the same section library as everything else.
 */
import { defaultStorefront } from '@/lib/storefront/rules'
import { presetContent } from '@/lib/storefront/presets'
import { readTemplate, templateFromLegacy, type Template } from '@/lib/theme/schema'
import type { ThemeSettings } from '@/lib/theme/settings'

export const THEME_PRESETS = {
  catalogue: { name: 'Catalogue', description: 'A modern shop with many products: hero, highlights, categories, product grid, reviews, questions.' },
  spotlight: { name: 'Spotlight', description: 'Built around one hero product with a story and benefits (the original Darwaish design).' },
  minimal: { name: 'Minimal', description: 'Calm and simple: a centred welcome, your newest products and one closing banner.' },
} as const
export type ThemePresetKey = keyof typeof THEME_PRESETS

export function themePreset(key: ThemePresetKey, storeName: string): { settings: ThemeSettings; home: Template } {
  if (key === 'spotlight') return { settings: { color: 'amber', customColor: '', font: 'serif' }, home: templateFromLegacy(presetContent('SINGLE_PRODUCT', storeName)) }
  const base = defaultStorefront(storeName)
  if (key === 'catalogue') return { settings: { color: 'emerald', customColor: '', font: 'sans' }, home: templateFromLegacy(base) }
  return {
    settings: { color: 'slate', customColor: '', font: 'serif' },
    home: readTemplate({ sections: [
      { id: 'hero-1', type: 'hero', settings: { title: base.hero.title, text: base.hero.text, primaryLabel: 'Shop now', primaryLink: '/shop', layout: 'centered', spotlight: false, showRating: true } },
      { id: 'product-grid-1', type: 'product-grid', settings: { title: 'New in', source: 'newest', count: '8', skipFirst: false, viewAll: true } },
      { id: 'cta-1', type: 'cta', settings: { title: base.cta.title, text: base.cta.text, label: base.cta.label, link: '/shop' } },
    ] }),
  }
}
