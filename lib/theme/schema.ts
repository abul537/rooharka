/**
 * THE THEME ENGINE: the section library and the rules for a page template. Pure (no database, no React), so it is
 * shared by the shop (to draw), the dashboard editor (to build the settings forms) and the tests.
 *
 * Words used here, the same as Shopify's:
 *  - THEME:    a named design a store owns. One is live; the others are drafts the owner can work on.
 *  - TEMPLATE: for one kind of page (today: "home"), the ordered list of sections to draw.
 *  - SECTION:  a ready-made building block (Hero, Product grid, ...). Each TYPE describes its own settings below;
 *              the editor draws its form from that description, so a new section needs no editor code.
 *  - BLOCK:    a repeated item inside a section (one highlight, one question, one benefit).
 *
 * Everything an owner types is PLAIN TEXT (React escapes it) and every address must be https or a page of the
 * shop, so a template can never carry code. `readTemplate` never throws: damaged or unknown parts are dropped,
 * the rest is kept, and a shop can never come out blank or broken.
 */
import { ICONS, safeUrl, type StorefrontContent } from '@/lib/storefront/rules'

// ------------------------------------------------------------------ fields (what a setting can be)
export type Field =
  | { key: string; label: string; kind: 'text'; max: number; hint?: string; required?: boolean; default?: string }
  | { key: string; label: string; kind: 'textarea'; max: number; hint?: string; default?: string }
  | { key: string; label: string; kind: 'image'; hint?: string } // an https image address
  | { key: string; label: string; kind: 'link'; hint?: string; default?: string } // https://... or a page of the shop like /shop
  | { key: string; label: string; kind: 'select'; options: { value: string; label: string }[]; default: string; hint?: string }
  | { key: string; label: string; kind: 'check'; default: boolean; hint?: string }
  | { key: string; label: string; kind: 'collection'; hint?: string } // one of the store's collections (its page address)
export type Value = string | boolean
export type Settings = Record<string, Value>

export interface BlockDef { name: string; plural: string; max: number; fields: Field[]; /** Which field names a block in the editor's list. */ titleKey: string }
export interface SectionDef {
  type: string; name: string; description: string
  fields: Field[]; blocks?: BlockDef
  /** How many of this section a page may have (most make sense once). */
  max: number
}

const sel = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }))
const HEADING: Field = { key: 'title', label: 'Heading', kind: 'text', max: 80 }

/** The section library. To add a section: describe it here and add its component to components/sections/registry.tsx. */
export const SECTIONS: SectionDef[] = [
  {
    type: 'hero', name: 'Hero banner', max: 2, description: 'The big welcome at the top: headline, text, buttons and a picture.',
    fields: [
      { key: 'badge', label: 'Small badge above the headline', kind: 'text', max: 60 },
      { key: 'title', label: 'Headline', kind: 'text', max: 120, required: true, default: 'Welcome to our shop' },
      { key: 'subtitle', label: 'Sub-headline', kind: 'text', max: 120 },
      { key: 'text', label: 'Text', kind: 'textarea', max: 300 },
      { key: 'primaryLabel', label: 'Main button', kind: 'text', max: 30, default: 'Shop now' },
      { key: 'primaryLink', label: 'Main button goes to', kind: 'link', default: '/shop', hint: 'A page of your shop like /shop, or https://…' },
      { key: 'secondaryLabel', label: 'Second button (optional)', kind: 'text', max: 30 },
      { key: 'secondaryLink', label: 'Second button goes to', kind: 'link' },
      { key: 'imageUrl', label: 'Picture', kind: 'image', hint: 'https://… Empty: your top product photo (when it is featured below) or your shop name.' },
      { key: 'layout', label: 'Layout', kind: 'select', default: 'image-right', options: sel(['image-right', 'Picture on the right'], ['image-left', 'Picture on the left'], ['centered', 'Centred, no picture']) },
      { key: 'spotlight', label: 'Feature my top product', kind: 'check', default: false, hint: 'Shows your featured product on the picture and sends the main button to it. Best for a shop built around one product.' },
      { key: 'showRating', label: 'Show my review score', kind: 'check', default: true, hint: 'Only shown once you have at least 3 approved reviews.' },
    ],
  },
  {
    type: 'highlights', name: 'Highlights bar', max: 2, description: 'Up to four short promises with an icon: delivery, cash on delivery, tracking…',
    fields: [],
    blocks: { name: 'Highlight', plural: 'Highlights', max: 4, titleKey: 'title', fields: [
      { key: 'icon', label: 'Icon', kind: 'select', default: 'check', options: ICONS.map((i) => ({ value: i, label: i[0].toUpperCase() + i.slice(1) })) },
      { key: 'title', label: 'Title', kind: 'text', max: 40, required: true },
      { key: 'text', label: 'Text', kind: 'text', max: 120 },
    ] },
  },
  {
    type: 'product-grid', name: 'Product grid', max: 4, description: 'A row of your products: featured, newest, or one collection.',
    fields: [
      { ...HEADING, default: 'Featured products' },
      { key: 'source', label: 'Which products', kind: 'select', default: 'featured', options: sel(['featured', 'Featured first, then newest'], ['newest', 'Newest'], ['collection', 'One collection (choose below)']) },
      { key: 'collection', label: 'Collection', kind: 'collection', hint: 'Only used when “One collection” is chosen above.' },
      { key: 'count', label: 'How many', kind: 'select', default: '8', options: sel(['4', '4'], ['8', '8'], ['12', '12']) },
      { key: 'skipFirst', label: 'Leave out the top product', kind: 'check', default: false, hint: 'Use this when the hero already features it.' },
      { key: 'viewAll', label: 'Show a “View all” link', kind: 'check', default: true },
    ],
  },
  { type: 'category-list', name: 'Shop by category', max: 1, description: 'Tiles for your shop categories.', fields: [{ ...HEADING, default: 'Shop by category' }] },
  { type: 'collection-list', name: 'Collections', max: 1, description: 'Tiles for the collections you made by hand.', fields: [{ ...HEADING, default: 'Our collections' }] },
  {
    type: 'image-text', name: 'Picture with text', max: 4, description: 'A picture beside a heading and a few paragraphs: your story, how it is made…',
    fields: [
      { ...HEADING, required: true, default: 'Our story' },
      { key: 'text', label: 'Text', kind: 'textarea', max: 1200, hint: 'Leave an empty line between paragraphs.' },
      { key: 'imageUrl', label: 'Picture', kind: 'image', hint: 'https://… Without a picture the text is centred.' },
      { key: 'imageSide', label: 'Picture side', kind: 'select', default: 'left', options: sel(['left', 'Left'], ['right', 'Right']) },
      { key: 'buttonLabel', label: 'Link text (optional)', kind: 'text', max: 40 },
      { key: 'buttonLink', label: 'Link goes to', kind: 'link' },
    ],
  },
  {
    type: 'rich-text', name: 'Text', max: 4, description: 'A heading and text on their own, with an optional button.',
    fields: [
      { ...HEADING, default: 'A few words' },
      { key: 'text', label: 'Text', kind: 'textarea', max: 1200, hint: 'Leave an empty line between paragraphs.' },
      { key: 'align', label: 'Alignment', kind: 'select', default: 'center', options: sel(['center', 'Centred'], ['left', 'Left']) },
      { key: 'buttonLabel', label: 'Button (optional)', kind: 'text', max: 30 },
      { key: 'buttonLink', label: 'Button goes to', kind: 'link' },
    ],
  },
  {
    type: 'benefits', name: 'Benefits list', max: 2, description: 'A ticked list of reasons to buy.',
    fields: [{ ...HEADING, default: 'Why customers choose us' }],
    blocks: { name: 'Benefit', plural: 'Benefits', max: 10, titleKey: 'text', fields: [{ key: 'text', label: 'Benefit', kind: 'text', max: 100, required: true }] },
  },
  {
    type: 'reviews', name: 'Customer reviews', max: 1, description: 'Your best real reviews. Only reviews you approved are ever shown; none can be typed in here.',
    fields: [{ ...HEADING, default: 'What our customers say' }],
  },
  {
    type: 'faq', name: 'Questions and answers', max: 2, description: 'Common questions that open when tapped.',
    fields: [{ ...HEADING, default: 'Questions, answered' }],
    blocks: { name: 'Question', plural: 'Questions', max: 12, titleKey: 'q', fields: [
      { key: 'q', label: 'Question', kind: 'text', max: 140, required: true },
      { key: 'a', label: 'Answer', kind: 'textarea', max: 700 },
    ] },
  },
  {
    type: 'cta', name: 'Closing banner', max: 2, description: 'A bold band with a heading and one button.',
    fields: [
      { ...HEADING, required: true, default: 'Ready to order?' },
      { key: 'text', label: 'Text', kind: 'text', max: 200 },
      { key: 'label', label: 'Button', kind: 'text', max: 30, default: 'Start shopping' },
      { key: 'link', label: 'Button goes to', kind: 'link', default: '/shop' },
    ],
  },
]
export const SECTION_BY_TYPE: ReadonlyMap<string, SectionDef> = new Map(SECTIONS.map((s) => [s.type, s]))

// ------------------------------------------------------------------ a template
export interface Block { id: string; settings: Settings }
export interface Section { id: string; type: string; hidden: boolean; settings: Settings; blocks: Block[] }
export interface Template { sections: Section[] }
export const TEMPLATE_TYPES = ['home'] as const
export type TemplateType = (typeof TEMPLATE_TYPES)[number]
export const MAX_SECTIONS = 25

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const idOk = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(v)
const hasMarkup = (s: string) => /[<>]/.test(s)

/** The value a field starts with. */
export function fieldDefault(f: Field): Value {
  if (f.kind === 'check') return f.default
  if (f.kind === 'select') return f.default
  return ('default' in f && f.default) || ''
}

/** One setting, cleaned: returns the value to keep, or an error message when `strict` (saving) and it is not acceptable. */
function cleanField(f: Field, raw: unknown, strict: boolean): { value: Value } | { error: string } {
  if (f.kind === 'check') return { value: typeof raw === 'boolean' ? raw : raw === 'on' || raw === 'true' ? true : raw === undefined ? f.default : false }
  const text = typeof raw === 'string' ? raw : raw === undefined || raw === null ? '' : String(raw)
  if (f.kind === 'select') {
    if (f.options.some((o) => o.value === text)) return { value: text }
    return strict && text !== '' ? { error: `${f.label}: choose one of the options.` } : { value: f.default }
  }
  if (f.kind === 'image' || f.kind === 'link') {
    const u = safeUrl(text.slice(0, 500), f.kind === 'link')
    if (u !== null) return { value: u }
    return strict ? { error: `${f.label} must start with https://${f.kind === 'link' ? ' or be a page of your shop like /shop' : ' (an image address)'}.` } : { value: '' }
  }
  if (f.kind === 'collection') return { value: /^[a-z0-9-]{1,60}$/.test(text) ? text : '' }
  // text / textarea
  const t = (f.kind === 'text' ? text.replace(/\s+/g, ' ') : text.replace(/\r/g, '')).trim()
  if (strict) {
    if (t.length > f.max) return { error: `${f.label} must be ${f.max} characters or fewer.` }
    if (hasMarkup(t)) return { error: `${f.label}: do not use < or >.` }
    if (f.kind === 'text' && f.required && !t) return { error: `${f.label} cannot be empty.` }
  }
  return { value: hasMarkup(t) ? t.replace(/[<>]/g, '') .slice(0, f.max) : t.slice(0, f.max) }
}

function cleanSettings(fields: Field[], raw: unknown, strict: boolean, where: string): { value: Settings } | { error: string } {
  const src = obj(raw), out: Settings = {}
  for (const f of fields) {
    const r = cleanField(f, src[f.key], strict)
    if ('error' in r) return { error: `${where}: ${r.error}` }
    out[f.key] = r.value
  }
  return { value: out } // settings the section does not describe are dropped
}

function clean(raw: unknown, strict: boolean): { ok: true; value: Template } | { ok: false; error: string } {
  const list = Array.isArray(obj(raw).sections) ? (obj(raw).sections as unknown[]) : []
  if (strict && list.length > MAX_SECTIONS) return { ok: false, error: `A page can have at most ${MAX_SECTIONS} sections.` }
  const sections: Section[] = [], seen = new Set<string>(), perType = new Map<string, number>()
  for (const item of list.slice(0, MAX_SECTIONS)) {
    const s = obj(item), def = SECTION_BY_TYPE.get(String(s.type))
    if (!def) { if (strict) return { ok: false, error: 'This page contains a section that does not exist any more. Reload the page.' }; continue }
    const n = (perType.get(def.type) ?? 0) + 1
    if (n > def.max) { if (strict) return { ok: false, error: `“${def.name}” can be used at most ${def.max === 1 ? 'once' : `${def.max} times`} on a page.` }; continue }
    const id = idOk(s.id) && !seen.has(s.id) ? s.id : null
    if (!id) { if (strict) return { ok: false, error: 'This page could not be read. Reload the page and try again.' }; continue }
    const settings = cleanSettings(def.fields, s.settings, strict, def.name)
    if ('error' in settings) return { ok: false, error: settings.error }
    const blocks: Block[] = []
    if (def.blocks) {
      const rawBlocks = Array.isArray(s.blocks) ? s.blocks : []
      if (strict && rawBlocks.length > def.blocks.max) return { ok: false, error: `${def.name}: at most ${def.blocks.max} ${def.blocks.plural.toLowerCase()}.` }
      const blockIds = new Set<string>()
      for (const [i, b] of rawBlocks.slice(0, def.blocks.max).entries()) {
        const bo = obj(b)
        const bs = cleanSettings(def.blocks.fields, bo.settings, strict, `${def.name}, ${def.blocks.name.toLowerCase()} ${i + 1}`)
        if ('error' in bs) return { ok: false, error: bs.error }
        // A block whose naming field is empty says nothing: it is dropped when reading (and refused above when saving).
        if (!strict && !String(bs.value[def.blocks.titleKey] ?? '').trim()) continue
        const bid = idOk(bo.id) && !blockIds.has(bo.id) ? bo.id : `b${i + 1}x${blocks.length}`
        blockIds.add(bid); blocks.push({ id: bid, settings: bs.value })
      }
    }
    seen.add(id); perType.set(def.type, n)
    sections.push({ id, type: def.type, hidden: s.hidden === true, settings: settings.value, blocks })
  }
  return { ok: true, value: { sections } }
}

/** Reading what is stored: never fails, drops what it does not understand. */
export const readTemplate = (raw: unknown): Template => (clean(raw, false) as { ok: true; value: Template }).value
/** Saving what the editor sent: the first problem is reported in plain words and nothing is saved. */
export const parseTemplate = (raw: unknown) => clean(raw, true)

/** A new section of a type, filled with its starting values. `id` must be new on the page. */
export function newSection(type: string, id: string): Section | null {
  const def = SECTION_BY_TYPE.get(type)
  if (!def) return null
  return { id, type, hidden: false, settings: Object.fromEntries(def.fields.map((f) => [f.key, fieldDefault(f)])), blocks: [] }
}
export const newBlock = (def: BlockDef, id: string): Block => ({ id, settings: Object.fromEntries(def.fields.map((f) => [f.key, fieldDefault(f)])) })
/** Short text for a section in the editor's list ("Hero banner: Welcome to our shop"). */
export function sectionSummary(s: Section): string {
  const def = SECTION_BY_TYPE.get(s.type)
  const t = String(s.settings.title ?? '').trim()
  return def ? (t ? `${def.name}: ${t}` : def.name) : s.type
}

// ------------------------------------------------------------------ from the old Storefront settings
/**
 * Builds the home template that looks exactly like the store's home page did before themes existed: the same parts,
 * in the same order, with the same words, respecting the old on/off switches. Used for stores that have not saved a
 * theme yet, so no shop changes or goes blank when the theme engine arrives.
 */
export function templateFromLegacy(c: StorefrontContent): Template {
  const single = c.layout === 'SINGLE_PRODUCT'
  const out: Section[] = []
  const add = (type: string, settings: Settings, blocks: Settings[] = [], hidden = false) => {
    const base = newSection(type, `${type}-${out.filter((s) => s.type === type).length + 1}`)!
    out.push({ ...base, hidden, settings: { ...base.settings, ...settings }, blocks: blocks.map((b, i) => ({ id: `b${i + 1}`, settings: b })) })
  }
  add('hero', { badge: c.hero.badge, title: c.hero.title, subtitle: c.hero.subtitle, text: c.hero.text, primaryLabel: c.hero.primaryLabel, primaryLink: '/shop', secondaryLabel: c.hero.secondaryLabel, secondaryLink: c.hero.secondaryLink, imageUrl: c.hero.imageUrl, layout: 'image-right', spotlight: single, showRating: true })
  if (c.trust.length) add('highlights', {}, c.trust.map((t) => ({ icon: t.icon, title: t.title, text: t.text })))
  if (!single) add('category-list', { title: 'Shop by category' }, [], !c.show.categories)
  add('product-grid', single ? { title: 'Also available', source: 'featured', collection: '', count: '4', skipFirst: true, viewAll: false } : { title: 'Featured products', source: 'featured', collection: '', count: '8', skipFirst: false, viewAll: true }, [], !c.show.featured)
  if (c.story.text || c.story.imageUrl) add('image-text', { title: c.story.title, text: c.story.text, imageUrl: c.story.imageUrl, imageSide: 'left', buttonLabel: 'Read more about us', buttonLink: '/about' }, [], !c.show.story)
  if (c.benefits.items.length) add('benefits', { title: c.benefits.title }, c.benefits.items.map((text) => ({ text })), !c.show.benefits)
  add('reviews', { title: 'What our customers say' }, [], !c.show.reviews)
  if (c.faq.length) add('faq', { title: 'Questions, answered' }, c.faq.map((f) => ({ q: f.q, a: f.a })), !c.show.faq)
  add('cta', { title: c.cta.title, text: c.cta.text, label: c.cta.label, link: '/shop' }, [], !c.show.cta)
  return readTemplate({ sections: out })
}
