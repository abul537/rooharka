import type { CSSProperties } from 'react'
import { PALETTES, type Color, type Font } from '@/lib/storefront/rules'

/** CSS variables for a store's colour and heading font. One stylesheet then serves every store's look. */
export function themeStyle(color: Color, font: Font): CSSProperties {
  const p = PALETTES[color]
  return {
    '--c-50': p.c50, '--c-100': p.c100, '--c-200': p.c200, '--c-600': p.c600, '--c-700': p.c700, '--c-800': p.c800,
    '--heading-font': font === 'serif' ? 'var(--font-playfair)' : 'var(--font-inter)',
  } as CSSProperties
}
