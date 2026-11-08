import type { Getter, Parsed } from '@/lib/admin/settings-rules'

/**
 * Everything a store owner controls about the customer-facing site, as ONE validated document.
 * Pure functions (no database): `readStorefront` never throws and always yields complete content, so a damaged or
 * empty record can never produce a blank or broken shop. Text is plain text (React escapes it); images and links
 * must be https (or a path on the shop itself).
 */
export const LAYOUTS = ['CATALOG', 'SINGLE_PRODUCT'] as const
export type Layout = (typeof LAYOUTS)[number]
export const FONTS = ['serif', 'sans'] as const
export type Font = (typeof FONTS)[number]
export const ICONS = ['truck', 'shield', 'leaf', 'clock', 'heart', 'star', 'phone', 'check', 'gift', 'wallet'] as const
export type Icon = (typeof ICONS)[number]
export const POLICY_KEYS = ['shipping', 'returns', 'privacy', 'terms'] as const
export type PolicyKey = (typeof POLICY_KEYS)[number]
export const POLICY_TITLES: Record<PolicyKey, string> = { shipping: 'Shipping and delivery', returns: 'Returns and refunds', privacy: 'Privacy policy', terms: 'Terms of service' }

/** Colour themes. Shades are applied as CSS variables, so one stylesheet serves every store. */
export const PALETTES = {
  amber: { name: 'Amber', c50: '#fffbeb', c100: '#fef3c7', c200: '#fde68a', c600: '#d97706', c700: '#b45309', c800: '#92400e' },
  emerald: { name: 'Emerald', c50: '#ecfdf5', c100: '#d1fae5', c200: '#a7f3d0', c600: '#059669', c700: '#047857', c800: '#065f46' },
  teal: { name: 'Teal', c50: '#f0fdfa', c100: '#ccfbf1', c200: '#99f6e4', c600: '#0d9488', c700: '#0f766e', c800: '#115e59' },
  indigo: { name: 'Indigo', c50: '#eef2ff', c100: '#e0e7ff', c200: '#c7d2fe', c600: '#4f46e5', c700: '#4338ca', c800: '#3730a3' },
  rose: { name: 'Rose', c50: '#fff1f2', c100: '#ffe4e6', c200: '#fecdd3', c600: '#e11d48', c700: '#be123c', c800: '#9f1239' },
  slate: { name: 'Slate', c50: '#f8fafc', c100: '#f1f5f9', c200: '#e2e8f0', c600: '#475569', c700: '#334155', c800: '#1e293b' },
} as const
export type Color = keyof typeof PALETTES
export const COLORS = Object.keys(PALETTES) as Color[]

export interface TrustItem { icon: Icon; title: string; text: string }
export interface FaqItem { q: string; a: string }
export interface StorefrontContent {
  layout: Layout
  color: Color
  font: Font
  tagline: string
  announcement: { text: string; link: string }
  footerBlurb: string
  social: { instagram: string; facebook: string; youtube: string; tiktok: string }
  hero: { badge: string; title: string; subtitle: string; text: string; primaryLabel: string; secondaryLabel: string; secondaryLink: string; imageUrl: string }
  trust: TrustItem[]
  show: { categories: boolean; featured: boolean; story: boolean; benefits: boolean; reviews: boolean; faq: boolean; cta: boolean }
  story: { title: string; text: string; imageUrl: string }
  benefits: { title: string; items: string[] }
  faq: FaqItem[]
  cta: { title: string; text: string; label: string }
  about: { title: string; body: string }
  contact: { intro: string; address: string; hours: string }
  policies: Record<PolicyKey, string>
}

/** Neutral built-in content for a store that has not customised anything yet: made from its own name, never another brand. */
export function defaultStorefront(storeName: string): StorefrontContent {
  const name = storeName.trim() || 'Our store'
  return {
    layout: 'CATALOG', color: 'emerald', font: 'sans', tagline: '', announcement: { text: '', link: '' }, footerBlurb: '',
    social: { instagram: '', facebook: '', youtube: '', tiktok: '' },
    hero: { badge: '', title: `Welcome to ${name}`, subtitle: '', text: 'Quality products, delivered to your door across Pakistan.', primaryLabel: 'Shop now', secondaryLabel: 'Our story', secondaryLink: '/about', imageUrl: '' },
    trust: [
      { icon: 'wallet', title: 'Cash on delivery', text: 'Pay when your order arrives (where the store allows it).' },
      { icon: 'truck', title: 'Delivery across Pakistan', text: 'We ship to your city and keep you updated.' },
      { icon: 'clock', title: 'Track your order', text: 'Follow your parcel any time with your tracking code.' },
      { icon: 'shield', title: 'Safe checkout', text: 'Your details are protected and never shared.' },
    ],
    show: { categories: true, featured: true, story: true, benefits: false, reviews: true, faq: true, cta: true },
    story: { title: `About ${name}`, text: '', imageUrl: '' },
    benefits: { title: 'Why customers choose us', items: [] },
    faq: [
      { q: 'How long does delivery take?', a: 'Most orders arrive within a few working days, depending on your city. You can track your order at any time.' },
      { q: 'Can I pay cash on delivery?', a: 'Yes, where the store has switched it on. You will see the payment options at checkout.' },
      { q: 'How do I contact the store?', a: 'Use the Contact page, call or send a WhatsApp message. Our details are in the footer.' },
    ],
    cta: { title: 'Ready to order?', text: 'Browse the shop and order in a few minutes.', label: 'Start shopping' },
    about: { title: `About ${name}`, body: '' },
    contact: { intro: 'Questions about an order or a product? Send us a message and we will reply as soon as we can.', address: '', hours: '' },
    policies: { shipping: '', returns: '', privacy: '', terms: '' },
  }
}

// ---------------------------------------------------------------- reading (defensive)
const str = (v: unknown, max: number, fb: string) => (typeof v === 'string' ? v.trim().slice(0, max) : fb)
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const bool = (v: unknown, fb: boolean) => (typeof v === 'boolean' ? v : fb)
const oneOf = <T extends string>(list: readonly T[], v: unknown, fb: T): T => (list.includes(v as T) ? (v as T) : fb)
/** Only https addresses (images and links to other sites) or a path on this shop. */
export function safeUrl(v: string, allowPath = true): string | null {
  const u = v.trim()
  if (!u) return ''
  if (allowPath && /^\/(?!\/)[^\s]*$/.test(u)) return u
  try { const p = new URL(u); return p.protocol === 'https:' && p.hostname.includes('.') ? p.toString() : null } catch { return null }
}
const url = (v: unknown, fb: string, allowPath = true) => (typeof v === 'string' ? safeUrl(v, allowPath) ?? fb : fb)

/** Reads stored JSON defensively over the defaults: a bad field falls back, the rest stays. */
export function readStorefront(raw: unknown, storeName: string): StorefrontContent {
  const d = defaultStorefront(storeName), v = obj(raw)
  const hero = obj(v.hero), ann = obj(v.announcement), soc = obj(v.social), show = obj(v.show), story = obj(v.story)
  const ben = obj(v.benefits), cta = obj(v.cta), about = obj(v.about), con = obj(v.contact), pol = obj(v.policies)
  const trust = Array.isArray(v.trust)
    ? v.trust.flatMap((t): TrustItem[] => { const o = obj(t); const title = str(o.title, 40, ''); return title ? [{ icon: oneOf(ICONS, o.icon, 'check'), title, text: str(o.text, 120, '') }] : [] }).slice(0, 4)
    : null
  const faq = Array.isArray(v.faq)
    ? v.faq.flatMap((t): FaqItem[] => { const o = obj(t); const q = str(o.q, 140, ''), a = str(o.a, 700, ''); return q && a ? [{ q, a }] : [] }).slice(0, 12)
    : null
  const items = Array.isArray(ben.items) ? ben.items.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim().slice(0, 100)).slice(0, 10) : null
  return {
    layout: oneOf(LAYOUTS, v.layout, d.layout), color: oneOf(COLORS, v.color, d.color), font: oneOf(FONTS, v.font, d.font),
    tagline: str(v.tagline, 80, d.tagline),
    announcement: { text: str(ann.text, 140, ''), link: url(ann.link, '') },
    footerBlurb: str(v.footerBlurb, 240, d.footerBlurb),
    social: { instagram: url(soc.instagram, '', false), facebook: url(soc.facebook, '', false), youtube: url(soc.youtube, '', false), tiktok: url(soc.tiktok, '', false) },
    hero: {
      badge: str(hero.badge, 60, d.hero.badge), title: str(hero.title, 120, d.hero.title) || d.hero.title, subtitle: str(hero.subtitle, 120, d.hero.subtitle),
      text: str(hero.text, 300, d.hero.text), primaryLabel: str(hero.primaryLabel, 30, d.hero.primaryLabel) || d.hero.primaryLabel,
      secondaryLabel: str(hero.secondaryLabel, 30, d.hero.secondaryLabel), secondaryLink: url(hero.secondaryLink, d.hero.secondaryLink), imageUrl: url(hero.imageUrl, '', false),
    },
    trust: trust ?? d.trust,
    show: {
      categories: bool(show.categories, d.show.categories), featured: bool(show.featured, d.show.featured), story: bool(show.story, d.show.story),
      benefits: bool(show.benefits, d.show.benefits), reviews: bool(show.reviews, d.show.reviews), faq: bool(show.faq, d.show.faq), cta: bool(show.cta, d.show.cta),
    },
    story: { title: str(story.title, 80, d.story.title) || d.story.title, text: str(story.text, 1200, d.story.text), imageUrl: url(story.imageUrl, '', false) },
    benefits: { title: str(ben.title, 80, d.benefits.title) || d.benefits.title, items: items ?? d.benefits.items },
    faq: faq ?? d.faq,
    cta: { title: str(cta.title, 80, d.cta.title) || d.cta.title, text: str(cta.text, 200, d.cta.text), label: str(cta.label, 30, d.cta.label) || d.cta.label },
    about: { title: str(about.title, 80, d.about.title) || d.about.title, body: str(about.body, 4000, d.about.body) },
    contact: { intro: str(con.intro, 300, d.contact.intro), address: str(con.address, 200, ''), hours: str(con.hours, 120, '') },
    policies: { shipping: str(pol.shipping, 6000, ''), returns: str(pol.returns, 6000, ''), privacy: str(pol.privacy, 6000, ''), terms: str(pol.terms, 6000, '') },
  }
}

/** Splits owner-typed text into paragraphs (blank lines separate them). */
export const paragraphs = (t: string) => t.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)

// ---------------------------------------------------------------- the admin forms (each saves one part)
export type Part = 'look' | 'home' | 'pages' | 'faq'
const text = (g: Getter, k: string) => String(g.get(k) ?? '').trim().replace(/[ \t]+/g, ' ')
const flag = (g: Getter, k: string) => g.get(k) === 'on'
const bad = (s: string) => /[<>]/.test(s)

function plain(g: Getter, k: string, label: string, min: number, max: number): string | { error: string } {
  const v = text(g, k).replace(/\s*\n\s*/g, ' ')
  if (v.length < min || v.length > max) return { error: `${label} must be ${min === 0 ? `at most ${max}` : `${min} to ${max}`} characters.` }
  if (bad(v)) return { error: `${label}: do not use < or >.` }
  return v
}
function link(g: Getter, k: string, label: string, allowPath: boolean): string | { error: string } {
  const v = safeUrl(text(g, k), allowPath)
  return v === null ? { error: `${label} must start with https://${allowPath ? ' or be a page on your shop like /shop' : ''}.` } : v
}
const fail = (r: unknown): r is { error: string } => typeof r === 'object' && r !== null && 'error' in r

/** Applies one admin form to the current content and returns the new content, or the first problem. */
export function applyPart(part: Part, g: Getter, cur: StorefrontContent): Parsed<StorefrontContent> {
  const next: StorefrontContent = structuredClone(cur)
  if (part === 'look') {
    const layout = oneOf(LAYOUTS, text(g, 'layout'), cur.layout), color = oneOf(COLORS, text(g, 'color'), cur.color), font = oneOf(FONTS, text(g, 'font'), cur.font)
    const tagline = plain(g, 'tagline', 'The tagline', 0, 80), at = plain(g, 'announcementText', 'The announcement', 0, 140), al = link(g, 'announcementLink', 'The announcement link', true)
    const blurb = plain(g, 'footerBlurb', 'The footer text', 0, 240)
    const soc = (['instagram', 'facebook', 'youtube', 'tiktok'] as const).map((k) => [k, link(g, k, `The ${k} address`, false)] as const)
    for (const r of [tagline, at, al, blurb, ...soc.map((s) => s[1])]) if (fail(r)) return { ok: false, error: r.error }
    Object.assign(next, { layout, color, font, tagline: tagline as string, footerBlurb: blurb as string })
    next.announcement = { text: at as string, link: at ? (al as string) : '' }
    for (const [k, v] of soc) next.social[k] = v as string
  } else if (part === 'home') {
    const h = {
      badge: plain(g, 'heroBadge', 'The badge', 0, 60), title: plain(g, 'heroTitle', 'The headline', 3, 120), subtitle: plain(g, 'heroSubtitle', 'The sub-headline', 0, 120),
      text: plain(g, 'heroText', 'The headline text', 0, 300), primaryLabel: plain(g, 'heroPrimary', 'The main button', 2, 30),
      secondaryLabel: plain(g, 'heroSecondary', 'The second button', 0, 30), secondaryLink: link(g, 'heroSecondaryLink', 'The second button link', true), imageUrl: link(g, 'heroImage', 'The hero image address', false),
    }
    const story = { title: plain(g, 'storyTitle', 'The story heading', 3, 80), imageUrl: link(g, 'storyImage', 'The story image address', false) }
    const ctaT = { title: plain(g, 'ctaTitle', 'The closing heading', 3, 80), text: plain(g, 'ctaText', 'The closing text', 0, 200), label: plain(g, 'ctaLabel', 'The closing button', 2, 30) }
    const benTitle = plain(g, 'benefitsTitle', 'The benefits heading', 3, 80)
    for (const r of [...Object.values(h), ...Object.values(story), ...Object.values(ctaT), benTitle]) if (fail(r)) return { ok: false, error: r.error }
    const storyText = String(g.get('storyText') ?? '').trim()
    if (storyText.length > 1200 || bad(storyText)) return { ok: false, error: 'The story must be 1200 characters or fewer, without < or >.' }
    const items = String(g.get('benefitItems') ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
    if (items.length > 10 || items.some((x) => x.length > 100 || bad(x))) return { ok: false, error: 'List up to 10 benefits, one per line, each up to 100 characters.' }
    const trust: TrustItem[] = []
    for (let i = 0; i < 4; i++) {
      const title = text(g, `trustTitle${i}`), t = text(g, `trustText${i}`)
      if (!title) continue
      if (title.length > 40 || t.length > 120 || bad(title + t)) return { ok: false, error: 'Each highlight needs a title up to 40 characters and text up to 120, without < or >.' }
      trust.push({ icon: oneOf(ICONS, text(g, `trustIcon${i}`), 'check'), title, text: t })
    }
    next.hero = h as StorefrontContent['hero']
    next.story = { ...(story as { title: string; imageUrl: string }), text: storyText }
    next.cta = ctaT as StorefrontContent['cta']
    next.benefits = { title: benTitle as string, items }
    next.trust = trust
    next.show = { categories: flag(g, 'show_categories'), featured: flag(g, 'show_featured'), story: flag(g, 'show_story'), benefits: flag(g, 'show_benefits'), reviews: flag(g, 'show_reviews'), faq: flag(g, 'show_faq'), cta: flag(g, 'show_cta') }
  } else if (part === 'pages') {
    const aboutTitle = plain(g, 'aboutTitle', 'The About heading', 3, 80), intro = plain(g, 'contactIntro', 'The contact intro', 0, 300)
    const address = plain(g, 'contactAddress', 'The address', 0, 200), hours = plain(g, 'contactHours', 'The opening hours', 0, 120)
    for (const r of [aboutTitle, intro, address, hours]) if (fail(r)) return { ok: false, error: r.error }
    const body = String(g.get('aboutBody') ?? '').trim()
    if (body.length > 4000 || bad(body)) return { ok: false, error: 'The About text must be 4000 characters or fewer, without < or >.' }
    next.about = { title: aboutTitle as string, body }
    next.contact = { intro: intro as string, address: address as string, hours: hours as string }
    for (const k of POLICY_KEYS) {
      const t = String(g.get(`policy_${k}`) ?? '').trim()
      if (t.length > 6000 || bad(t)) return { ok: false, error: `${POLICY_TITLES[k]} must be 6000 characters or fewer, without < or >.` }
      next.policies[k] = t
    }
  } else {
    const faq: FaqItem[] = []
    for (const [i, line] of String(g.get('faq') ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).entries()) {
      const [q, ...rest] = line.split('|').map((x) => x.trim()), a = rest.join(' | ')
      if (!q || q.length > 140 || !a || a.length > 700 || bad(line)) return { ok: false, error: `Question ${i + 1}: write it as  question | answer  (question up to 140, answer up to 700 characters, no < or >).` }
      faq.push({ q, a })
    }
    if (faq.length > 12) return { ok: false, error: 'Use at most 12 questions.' }
    next.faq = faq
  }
  return { ok: true, value: next }
}

export const faqToText = (f: FaqItem[]) => f.map((x) => `${x.q} | ${x.a}`).join('\n')
