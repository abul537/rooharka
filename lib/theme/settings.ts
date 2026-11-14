/**
 * A theme's GLOBAL settings (the look shared by every page): the brand colour and the heading font.
 * They reach the shop as CSS variables on one wrapper element, so a single stylesheet serves every store.
 * Pure and tested.
 */
import { COLORS, FONTS, PALETTES, type Color, type Font } from '@/lib/storefront/rules'

export interface ThemeSettings {
  /** One of the ready palettes ... */
  color: Color
  /** ... or the owner's own brand colour (#rrggbb). When set, it wins over `color`. */
  customColor: string
  font: Font
}
export const DEFAULT_THEME_SETTINGS: ThemeSettings = { color: 'emerald', customColor: '', font: 'sans' }
export interface Shades { c50: string; c100: string; c200: string; c600: string; c700: string; c800: string }

const HEX = /^#[0-9a-f]{6}$/
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const hex = (c: number[]) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`
/** Mixes a colour with white (towards 1) or black. */
const mix = (c: [number, number, number], other: number, amount: number) => hex(c.map((v) => v + (other - v) * amount))

/** How bright a colour is to the eye (0 black .. 1 white), by the standard web-accessibility formula. */
export function luminance(h: string): number {
  const [r, g, b] = rgb(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** Contrast of white text on this colour (1 = unreadable, 21 = black). 4.5 is the accepted minimum for body text. */
export const contrastWithWhite = (h: string) => 1.05 / (luminance(h) + 0.05)
export const MIN_CONTRAST = 4.5

/** "#1A7f5a " -> "#1a7f5a", or null when it is not a colour. Also accepts the short form #abc. */
export function normalizeHex(raw: string): string | null {
  let v = raw.trim().toLowerCase()
  if (/^#[0-9a-f]{3}$/.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
  return HEX.test(v) ? v : null
}

/**
 * The six shades the shop uses, made from ONE brand colour: the colour itself for buttons and links (c700),
 * a little darker for pressed buttons (c800), a little lighter (c600), and three very pale tints for backgrounds.
 */
export function shadesFromHex(h: string): Shades {
  const c = rgb(h)
  return { c50: mix(c, 255, 0.94), c100: mix(c, 255, 0.86), c200: mix(c, 255, 0.72), c600: mix(c, 255, 0.14), c700: h, c800: mix(c, 0, 0.2) }
}

/** Checks the owner's own colour: it must be a colour, and dark enough that white button text stays readable. */
export function parseCustomColor(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  if (!raw.trim()) return { ok: true, value: '' }
  const h = normalizeHex(raw)
  if (!h) return { ok: false, error: 'Write the brand colour like #1a7f5a (a # and six letters or digits).' }
  if (contrastWithWhite(h) < MIN_CONTRAST) return { ok: false, error: 'That colour is too light: white text on your buttons would be hard to read. Choose a darker shade.' }
  return { ok: true, value: h }
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
/** Reads stored settings defensively: anything wrong falls back to `fallback` (the store's old colour and font). */
export function readThemeSettings(raw: unknown, fallback: ThemeSettings = DEFAULT_THEME_SETTINGS): ThemeSettings {
  const v = obj(raw)
  const custom = typeof v.customColor === 'string' ? parseCustomColor(v.customColor) : null
  return {
    color: COLORS.includes(v.color as Color) ? (v.color as Color) : fallback.color,
    customColor: custom?.ok ? custom.value : '',
    font: FONTS.includes(v.font as Font) ? (v.font as Font) : fallback.font,
  }
}
export const themeShades = (s: ThemeSettings): Shades => (s.customColor ? shadesFromHex(s.customColor) : PALETTES[s.color])

/** The CSS variables for a theme, ready for a `style` attribute. */
export function themeVariables(s: ThemeSettings): Record<string, string> {
  const p = themeShades(s)
  return { '--c-50': p.c50, '--c-100': p.c100, '--c-200': p.c200, '--c-600': p.c600, '--c-700': p.c700, '--c-800': p.c800, '--heading-font': s.font === 'serif' ? 'var(--font-playfair)' : 'var(--font-inter)' }
}

export const MAX_THEMES = 10
export function parseThemeName(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const n = raw.trim().replace(/\s+/g, ' ')
  if (n.length < 2 || n.length > 50 || /[<>]/.test(n)) return { ok: false, error: 'The theme name must be 2 to 50 characters, without < or >.' }
  return { ok: true, value: n }
}
