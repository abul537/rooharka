/**
 * SHOP SPEED, MEASURED ON REAL VISITS: the rules. Pure, so they are unit-tested.
 *
 * A quarter of page loads report three numbers from the visitor's own browser (Google's "Core Web Vitals"):
 *   LCP  = how long until the largest picture or text block was on screen (target: within 2.5 seconds),
 *   TTFB = how long until the server's first answer arrived (good: within 0.8 seconds; our aim: about 0.2),
 *   CLS  = how much the page jumped while loading (good: 0.1 or less).
 * They are added up per shop, day and kind of page. No visitor is identified and nothing personal is kept.
 */
export const SPEED_PAGES = ['home', 'product', 'collection', 'shop', 'checkout', 'other'] as const
export type SpeedPage = (typeof SPEED_PAGES)[number]
export const SPEED_LABEL: Record<SpeedPage, string> = { home: 'Home page', product: 'Product pages', collection: 'Collection pages', shop: 'Shop (all products)', checkout: 'Checkout', other: 'Other pages' }
export const LCP_GOOD_MS = 2500, LCP_POOR_MS = 4000, TTFB_GOOD_MS = 800, CLS_GOOD = 0.1
/** Google calls a page fast when at least 75 of 100 visits are good. */
export const GOOD_SHARE_TARGET = 75
/** One page load in this many reports its speed. */
export const SPEED_SAMPLE = 4
/** Fewer visits than this is too few to judge. */
export const SPEED_MIN_SAMPLES = 20

export function speedPage(path: unknown): SpeedPage {
  const p = typeof path === 'string' ? path.split('?')[0] : ''
  if (p === '/' || p === '') return 'home'
  if (p.startsWith('/product/')) return 'product'
  if (p.startsWith('/collections/')) return 'collection'
  if (p === '/shop') return 'shop'
  if (p.startsWith('/checkout')) return 'checkout'
  return 'other'
}

export interface SpeedReport { page: SpeedPage; lcp: number; ttfb: number; cls: number }
const ms = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max ? Math.round(v) : null)
/** One report from a browser, checked. Impossible numbers (zero, negative, over a minute) are thrown away whole. */
export function parseSpeedReport(raw: unknown): SpeedReport | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const lcp = ms(o.lcp, 60_000), ttfb = ms(o.ttfb, 60_000)
  const cls = typeof o.cls === 'number' && Number.isFinite(o.cls) && o.cls >= 0 && o.cls <= 10 ? o.cls : null
  if (lcp === null || ttfb === null || cls === null || ttfb > lcp) return null
  return { page: speedPage(o.path), lcp, ttfb, cls }
}
/** What one report adds to its day's row. */
export const speedIncrements = (r: SpeedReport) => ({
  samples: 1, lcpGood: r.lcp <= LCP_GOOD_MS ? 1 : 0, lcpPoor: r.lcp > LCP_POOR_MS ? 1 : 0, lcpMsSum: r.lcp,
  ttfbGood: r.ttfb <= TTFB_GOOD_MS ? 1 : 0, ttfbMsSum: r.ttfb, clsGood: r.cls <= CLS_GOOD ? 1 : 0,
})

export interface SpeedRow { page: string; samples: number; lcpGood: number; lcpPoor: number; lcpMsSum: number; ttfbGood: number; ttfbMsSum: number; clsGood: number }
export interface SpeedSummary { samples: number; lcpGoodShare: number; lcpAverageMs: number; ttfbAverageMs: number; clsGoodShare: number; verdict: 'fast' | 'ok' | 'slow' }
/** Adds rows up (several days, several kinds of page) into one line. null while there are too few visits to judge. */
export function summariseSpeed(rows: SpeedRow[]): SpeedSummary | null {
  const t = rows.reduce((a, r) => ({ samples: a.samples + r.samples, lcpGood: a.lcpGood + r.lcpGood, lcpPoor: a.lcpPoor + r.lcpPoor, lcpMsSum: a.lcpMsSum + r.lcpMsSum, ttfbMsSum: a.ttfbMsSum + r.ttfbMsSum, clsGood: a.clsGood + r.clsGood }), { samples: 0, lcpGood: 0, lcpPoor: 0, lcpMsSum: 0, ttfbMsSum: 0, clsGood: 0 })
  if (t.samples < SPEED_MIN_SAMPLES) return null
  const share = (n: number) => Math.round((n / t.samples) * 100)
  const lcpGoodShare = share(t.lcpGood)
  return {
    samples: t.samples, lcpGoodShare, lcpAverageMs: Math.round(t.lcpMsSum / t.samples), ttfbAverageMs: Math.round(t.ttfbMsSum / t.samples), clsGoodShare: share(t.clsGood),
    verdict: lcpGoodShare >= GOOD_SHARE_TARGET ? 'fast' : share(t.lcpPoor) > 25 ? 'slow' : 'ok',
  }
}
export const seconds = (msValue: number) => `${(msValue / 1000).toFixed(1)} s`
