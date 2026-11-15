/**
 * ADVERTISING PIXELS: the rules (pure). A store owner pastes the ids of their own Meta (Facebook / Instagram),
 * TikTok and Google Analytics accounts; the shop then reports page views, product views, add-to-cart, checkout
 * and purchases to them, so the owner's ads can be measured. Ids are checked strictly because they are written
 * into the page's script: only letters, digits and a dash can ever get through.
 */
export interface Pixels { meta: string; tiktok: string; ga4: string }
export const NO_PIXELS: Pixels = { meta: '', tiktok: '', ga4: '' }
const RULES: Record<keyof Pixels, { re: RegExp; name: string; hint: string }> = {
  meta: { re: /^\d{10,20}$/, name: 'Meta Pixel ID', hint: '10 to 20 digits, from Meta Events Manager' },
  tiktok: { re: /^[A-Z0-9]{15,25}$/, name: 'TikTok Pixel ID', hint: '15 to 25 capital letters and digits, from TikTok Ads Manager' },
  ga4: { re: /^G-[A-Z0-9]{6,12}$/, name: 'Google Analytics ID', hint: 'starts with G-, from Google Analytics' },
}
export const PIXEL_HINTS = RULES
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** Reads the ids out of StoreSettings.extra. Anything that is not exactly a valid id is dropped (never written into a page). */
export function readPixels(extra: unknown): Pixels {
  const p = obj(obj(extra).pixels)
  const ok = (k: keyof Pixels) => (typeof p[k] === 'string' && RULES[k].re.test(p[k] as string) ? (p[k] as string) : '')
  return { meta: ok('meta'), tiktok: ok('tiktok'), ga4: ok('ga4') }
}
export function parsePixelsForm(get: (k: string) => unknown): { ok: true; value: Pixels } | { ok: false; error: string } {
  const out = { ...NO_PIXELS }
  for (const k of Object.keys(RULES) as (keyof Pixels)[]) {
    const v = String(get(k) ?? '').trim().toUpperCase()
    if (v && !RULES[k].re.test(v)) return { ok: false, error: `${RULES[k].name}: that does not look right (${RULES[k].hint}). Leave it empty if you do not use it.` }
    out[k] = v
  }
  return { ok: true, value: out }
}
export const hasPixels = (p: Pixels) => !!(p.meta || p.tiktok || p.ga4)

/**
 * The script that starts the connected pixels. Built ONLY from ids that passed the strict patterns above (digits,
 * capital letters and a dash), so nothing a person typed can break out of it. These are the vendors' own standard
 * loaders; each also records the first page view.
 */
export function pixelScript(p: Pixels): string {
  const safe = readPixels({ pixels: p }) // checked again at the last moment
  const parts: string[] = []
  if (safe.meta) parts.push(`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${safe.meta}');fbq('track','PageView');`)
  if (safe.tiktok) parts.push(`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;var o=d.createElement("script");o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${safe.tiktok}');ttq.page()}(window,document,'ttq');`)
  if (safe.ga4) parts.push(`(function(){var s=document.createElement('script');s.async=!0;s.src='https://www.googletagmanager.com/gtag/js?id=${safe.ga4}';document.head.appendChild(s);window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments)};gtag('js',new Date());gtag('config','${safe.ga4}')})();`)
  return parts.join('\n')
}
