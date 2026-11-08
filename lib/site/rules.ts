import type { Getter, Parsed } from '@/lib/admin/settings-rules'

/**
 * What the platform owner can change on the public home page, from CSMI. Pure parsing, so every limit is tested.
 * Anything missing or damaged falls back to the built-in wording, so the public site can never render empty.
 */
export const ICONS = ['map', 'shield', 'truck', 'wallet', 'package', 'users', 'lock', 'globe', 'banknote', 'star', 'zap', 'heart', 'chart', 'phone', 'clock', 'check'] as const
export type IconKey = (typeof ICONS)[number]

export interface SiteFeature { icon: IconKey; title: string; text: string }
export interface SiteFaq { q: string; a: string }
export interface SiteSections { features: boolean; compare: boolean; steps: boolean; pricing: boolean; faq: boolean; clients: boolean }
export interface SiteContent {
  heroBadge: string; heroTitle: string; heroText: string; ctaNote: string
  worksWith: string[]
  featuresTitle: string; featuresIntro: string
  features: SiteFeature[]
  faq: SiteFaq[]
  sections: SiteSections
  clientsTitle: string
  /** Show the real number of stores on the platform ("42 stores run on Rooharka"). Never invented: it is counted. */
  showStoreCount: boolean
}

export const MAX_FEATURES = 12
export const MAX_FAQ = 12

export const DEFAULT_SITE: SiteContent = {
  heroBadge: 'Built for sellers in Pakistan',
  heroTitle: 'Your online store, ready for Pakistan from day one',
  heroText: 'Address dropdowns your customers can actually use, protection against fake orders, and courier booking and tracking, all in one dashboard.',
  ctaNote: 'No card needed. Set up in minutes.',
  worksWith: ['Cash on delivery', 'JazzCash', 'EasyPaisa', 'PostEx', 'Leopards', 'TCS', 'Rupees (PKR)'],
  featuresTitle: 'Everything a Pakistani store needs',
  featuresIntro: 'The things other platforms leave you to fix yourself are already here.',
  features: [
    { icon: 'map', title: 'Pakistan address dropdowns', text: 'Customers pick province, city and locality from a full Pakistan address list instead of typing. Cleaner addresses, fewer failed deliveries.' },
    { icon: 'shield', title: 'Fake-order protection', text: 'Switch on a phone-code check before checkout. Only customers who can receive the code place an order, sent through your own SMS or WhatsApp account.' },
    { icon: 'truck', title: 'Courier booking and tracking', text: 'Use PostEx, Leopards, TCS or any local company. Book in one click where supported, track every parcel, and let orders update as the courier does.' },
    { icon: 'wallet', title: 'Payment rules you control', text: 'Cash on delivery, delivery-fee advance or full advance, with JazzCash and EasyPaisa each switched on or off. You set the policy.' },
    { icon: 'package', title: 'Order tracking page', text: 'Buyers paste their tracking code and see their order and delivery status. It builds trust and cuts "where is my order" calls.' },
    { icon: 'users', title: 'Customer profiles', text: 'See each customer’s details, order history and what they bought, in one place.' },
    { icon: 'globe', title: 'Your own web address', text: 'Start on a free address right away and connect your own domain when you are ready.' },
    { icon: 'lock', title: 'Security built in', text: 'Two-factor sign-in, encrypted API keys, a full audit trail of every change, and each store’s data kept strictly apart.' },
    { icon: 'banknote', title: 'No markup on your providers', text: 'You pay couriers, SMS and wallets directly. The platform never sits between you and those costs.' },
  ],
  faq: [
    { q: 'How much does it cost?', a: 'Plans are listed on the pricing page. You start with a free trial, and no card is needed to begin.' },
    { q: 'Who pays for SMS codes and couriers?', a: 'You do, directly to those companies. We never add a markup, and the platform is not in the middle of that money.' },
    { q: 'Do I need my own domain?', a: 'No. Your store starts on a free address. You can connect your own domain later.' },
    { q: 'Can I sell with cash on delivery?', a: 'Yes. You choose between cash on delivery, a delivery-fee advance, or full advance payment, and you can require a phone-code check on top.' },
    { q: 'Which couriers can I use?', a: 'PostEx and Leopards can be booked and tracked from your dashboard. TCS and any other local company work by entering the tracking number.' },
    { q: 'Is my data safe?', a: 'Each store’s data is kept strictly separate. Sign-in supports two-factor protection, your provider keys are stored encrypted, and every change is logged.' },
  ],
  sections: { features: true, compare: true, steps: true, pricing: true, faq: true, clients: true },
  clientsTitle: 'Trusted by growing brands',
  showStoreCount: false,
}

const s = (v: unknown, max: number, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback)
const isIcon = (v: unknown): v is IconKey => typeof v === 'string' && (ICONS as readonly string[]).includes(v)

/** Reads the stored JSON defensively: every field is checked and falls back to the built-in text. */
export function readSite(raw: unknown): SiteContent {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const features = Array.isArray(v.features)
    ? v.features.flatMap((f): SiteFeature[] => {
        const o = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>
        const title = s(o.title, 60, ''), text = s(o.text, 300, '')
        return title && text ? [{ icon: isIcon(o.icon) ? o.icon : 'star', title, text }] : []
      }).slice(0, MAX_FEATURES)
    : []
  const faq = Array.isArray(v.faq)
    ? v.faq.flatMap((f): SiteFaq[] => {
        const o = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>
        const q = s(o.q, 120, ''), a = s(o.a, 600, '')
        return q && a ? [{ q, a }] : []
      }).slice(0, MAX_FAQ)
    : []
  const sec = (v.sections && typeof v.sections === 'object' ? v.sections : {}) as Record<string, unknown>
  const flag = (k: keyof SiteSections) => (typeof sec[k] === 'boolean' ? (sec[k] as boolean) : DEFAULT_SITE.sections[k])
  const works = Array.isArray(v.worksWith) ? v.worksWith.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim().slice(0, 30)).slice(0, 12) : null
  return {
    heroBadge: s(v.heroBadge, 60, DEFAULT_SITE.heroBadge),
    heroTitle: s(v.heroTitle, 120, DEFAULT_SITE.heroTitle),
    heroText: s(v.heroText, 300, DEFAULT_SITE.heroText),
    ctaNote: s(v.ctaNote, 80, DEFAULT_SITE.ctaNote),
    worksWith: works && works.length ? works : DEFAULT_SITE.worksWith,
    featuresTitle: s(v.featuresTitle, 80, DEFAULT_SITE.featuresTitle),
    featuresIntro: s(v.featuresIntro, 200, DEFAULT_SITE.featuresIntro),
    features: features.length ? features : DEFAULT_SITE.features,
    faq: faq.length ? faq : DEFAULT_SITE.faq,
    sections: { features: flag('features'), compare: flag('compare'), steps: flag('steps'), pricing: flag('pricing'), faq: flag('faq'), clients: flag('clients') },
    clientsTitle: s(v.clientsTitle, 80, DEFAULT_SITE.clientsTitle),
    showStoreCount: v.showStoreCount === true,
  }
}

// ---------------------------------------------------- list <-> text (the editor uses one line per item)
export const featuresToText = (f: SiteFeature[]) => f.map((x) => `${x.icon} | ${x.title} | ${x.text}`).join('\n')
export const faqToText = (f: SiteFaq[]) => f.map((x) => `${x.q} | ${x.a}`).join('\n')

const lines = (t: string) => t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

export function parseFeatures(t: string): Parsed<SiteFeature[]> {
  const out: SiteFeature[] = []
  for (const [i, line] of lines(t).entries()) {
    const [icon, title, ...rest] = line.split('|').map((x) => x.trim())
    const text = rest.join(' | ')
    if (!isIcon(icon)) return { ok: false, error: `Feature line ${i + 1}: the first part must be one of these icons: ${ICONS.join(', ')}.` }
    if (!title || title.length > 60) return { ok: false, error: `Feature line ${i + 1}: the title must be 1 to 60 characters.` }
    if (!text || text.length > 300) return { ok: false, error: `Feature line ${i + 1}: the description must be 1 to 300 characters.` }
    if (/[<>]/.test(line)) return { ok: false, error: `Feature line ${i + 1}: do not use < or >.` }
    out.push({ icon, title, text })
  }
  if (out.length === 0) return { ok: false, error: 'Add at least one feature (or leave the box as it was).' }
  if (out.length > MAX_FEATURES) return { ok: false, error: `Use at most ${MAX_FEATURES} features.` }
  return { ok: true, value: out }
}

export function parseFaq(t: string): Parsed<SiteFaq[]> {
  const out: SiteFaq[] = []
  for (const [i, line] of lines(t).entries()) {
    const [q, ...rest] = line.split('|').map((x) => x.trim())
    const a = rest.join(' | ')
    if (!q || q.length > 120) return { ok: false, error: `Question line ${i + 1}: the question must be 1 to 120 characters.` }
    if (!a || a.length > 600) return { ok: false, error: `Question line ${i + 1}: the answer must be 1 to 600 characters.` }
    if (/[<>]/.test(line)) return { ok: false, error: `Question line ${i + 1}: do not use < or >.` }
    out.push({ q, a })
  }
  if (out.length === 0) return { ok: false, error: 'Add at least one question.' }
  if (out.length > MAX_FAQ) return { ok: false, error: `Use at most ${MAX_FAQ} questions.` }
  return { ok: true, value: out }
}

const text = (g: Getter, k: string) => String(g.get(k) ?? '').trim().replace(/\s+/g, ' ')

export function parseSiteForm(g: Getter): Parsed<SiteContent> {
  const lim = (k: string, label: string, min: number, max: number): string | { error: string } => {
    const v = text(g, k)
    if (v.length < min || v.length > max) return { error: `${label} must be ${min} to ${max} characters.` }
    if (/[<>]/.test(v)) return { error: `${label}: do not use < or >.` }
    return v
  }
  const fields = {
    heroBadge: lim('heroBadge', 'The badge', 2, 60), heroTitle: lim('heroTitle', 'The main headline', 5, 120), heroText: lim('heroText', 'The headline text', 5, 300),
    ctaNote: lim('ctaNote', 'The note under the buttons', 0, 80), featuresTitle: lim('featuresTitle', 'The features heading', 3, 80), featuresIntro: lim('featuresIntro', 'The features intro', 0, 200),
    clientsTitle: lim('clientsTitle', 'The clients heading', 3, 80),
  }
  for (const v of Object.values(fields)) if (typeof v !== 'string') return { ok: false, error: v.error }
  const works = String(g.get('worksWith') ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  if (works.length === 0 || works.length > 12 || works.some((w) => w.length > 30 || /[<>]/.test(w))) return { ok: false, error: 'List 1 to 12 names separated by commas, each up to 30 characters.' }
  const features = parseFeatures(String(g.get('features') ?? '')); if (!features.ok) return features
  const faq = parseFaq(String(g.get('faq') ?? '')); if (!faq.ok) return faq
  const on = (k: string) => g.get(k) === 'on'
  return {
    ok: true,
    value: {
      ...(fields as Record<keyof typeof fields, string>), worksWith: works, features: features.value, faq: faq.value,
      sections: { features: on('sec_features'), compare: on('sec_compare'), steps: on('sec_steps'), pricing: on('sec_pricing'), faq: on('sec_faq'), clients: on('sec_clients') },
      showStoreCount: on('showStoreCount'),
    },
  }
}
