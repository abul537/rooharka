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
  | { key: string; label: string; kind: 'image'; hint?: string } // an https image address (uploaded, picked from the library, or pasted)
  | { key: string; label: string; kind: 'video'; hint?: string } // an https video address (.mp4 / .webm)
  | { key: string; label: string; kind: 'focal'; of: string; hint?: string } // the important point of the picture in field `of`, as "x,y" (0-100 each)
  | { key: string; label: string; kind: 'ratio'; default: Ratio; hint?: string } // the SHAPE of a picture: a preset, never pixels
  | { key: string; label: string; kind: 'link'; hint?: string; default?: string } // https://... or a page of the shop like /shop
  | { key: string; label: string; kind: 'select'; options: { value: string; label: string }[]; default: string; hint?: string }
  | { key: string; label: string; kind: 'check'; default: boolean; hint?: string }
  | { key: string; label: string; kind: 'collection'; hint?: string } // one of the store's collections (its page address)

/**
 * The only shapes a picture can have. An owner never types a width or height: they choose a shape, and the
 * picture is cropped to it around its focal point. This is what keeps every shop tidy on every screen.
 */
export const RATIOS = { '1:1': 'Square (1:1)', '4:5': 'Portrait (4:5)', '16:9': 'Wide (16:9)', '3:1': 'Banner (3:1)', '21:9': 'Cinema (21:9)' } as const
export type Ratio = keyof typeof RATIOS
/** "16:9" -> "16 / 9" for the CSS aspect-ratio property. */
export const ratioCss = (r: unknown) => (typeof r === 'string' && r in RATIOS ? r.replace(':', ' / ') : '1 / 1')
/** "30,70" -> "30% 70%" for CSS object-position (which part of a cropped picture stays visible). Centre when unset. */
export function focalCss(v: unknown): string {
  const m = typeof v === 'string' ? /^(\d{1,3}),(\d{1,3})$/.exec(v) : null
  return m && Number(m[1]) <= 100 && Number(m[2]) <= 100 ? `${m[1]}% ${m[2]}%` : '50% 50%'
}

// The hard limits. They are enforced when a page is saved, whatever the editor allowed.
export const MAX_GALLERY_IMAGES = 30
/** A gallery grid shows this many pictures; the rest open with "Show all". */
export const GALLERY_FOLD = 8
export const MAX_STORY_STEPS = 6
export const MAX_HERO_SLIDES = 3
export const MAX_VIDEOS_PER_SECTION = 2
export const MAX_VIDEO_SECTIONS = 3
export const VIDEO_MAX_SECONDS = 15
export const VIDEO_MAX_BYTES = 10 * 1024 * 1024
/** Roughly how much the top of a page should weigh before the editor warns the owner. */
export const FOLD_BUDGET_BYTES = 2 * 1024 * 1024

export type Value = string | boolean
export type Settings = Record<string, Value>

export interface BlockDef { name: string; plural: string; max: number; fields: Field[]; /** Which field names a block in the editor's list. */ titleKey: string }
export interface SectionDef {
  type: string; name: string; description: string
  /** A section from before the ten-section library. Still drawn and editable; listed under "Classic sections". */
  classic?: boolean
  fields: Field[]; blocks?: BlockDef
  /** How many of this section a page may have (most make sense once). */
  max: number
  /** A section that belongs to one kind of page only (the product's own details cannot be put on the home page). */
  only?: 'product' | 'collection'
  /** The heart of its page: always there, cannot be removed or hidden (a product page without the product is not one). */
  required?: boolean
}

const sel = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }))
const HEADING: Field = { key: 'title', label: 'Heading', kind: 'text', max: 80 }
const picture = (key = 'imageUrl', label = 'Picture', hint?: string): Field[] => [
  { key, label, kind: 'image', hint },
  { key: `${key.replace(/Url$/, '')}Focal`, label: 'Important part of the picture', kind: 'focal', of: key, hint: 'Drag the dot onto what must stay visible when the picture is cropped.' },
]

/**
 * The section library: ten sections, each with two to four LAYOUTS (variants). The layouts are what make shops look
 * different from each other. To add a section: describe it here and add its component to components/sections/registry.tsx.
 */
export const SECTIONS: SectionDef[] = [
  {
    type: 'hero', name: 'Hero', max: 2, description: 'The big welcome at the top. Layouts: text beside a picture, full-width picture, background video, or up to 3 slides.',
    fields: [
      { key: 'layout', label: 'Layout', kind: 'select', default: 'image-right', options: sel(['image-right', 'Split: picture on the right'], ['image-left', 'Split: picture on the left'], ['full-bleed', 'Full-width picture with text on top'], ['video', 'Background video (muted; a picture on phones)'], ['carousel', 'Slides (up to 3, add them below)'], ['centered', 'Centred text, no picture']) },
      { key: 'badge', label: 'Small badge above the headline', kind: 'text', max: 60 },
      { key: 'title', label: 'Headline', kind: 'text', max: 120, required: true, default: 'Welcome to our shop' },
      { key: 'subtitle', label: 'Sub-headline', kind: 'text', max: 120 },
      { key: 'text', label: 'Text', kind: 'textarea', max: 300 },
      { key: 'primaryLabel', label: 'Main button', kind: 'text', max: 30, default: 'Shop now' },
      { key: 'primaryLink', label: 'Main button goes to', kind: 'link', default: '/shop', hint: 'A page of your shop like /shop, or https://…' },
      { key: 'secondaryLabel', label: 'Second button (optional)', kind: 'text', max: 30 },
      { key: 'secondaryLink', label: 'Second button goes to', kind: 'link' },
      ...picture('imageUrl', 'Picture', 'Empty: your top product photo (when it is featured below) or your shop name. For the video layout this is what phones show.'),
      { key: 'ratio', label: 'Shape of the wide picture', kind: 'ratio', default: '21:9', hint: 'Used by the full-width, video and slides layouts.' },
      { key: 'videoUrl', label: 'Background video', kind: 'video', hint: 'Only for the video layout. Up to 15 seconds and 10 MB. It plays silently on computers; phones show the picture instead.' },
      { key: 'spotlight', label: 'Feature my top product', kind: 'check', default: false, hint: 'Shows your featured product on the picture and sends the main button to it. Best for a shop built around one product.' },
      { key: 'showRating', label: 'Show my review score', kind: 'check', default: true, hint: 'Only shown once you have at least 3 approved reviews.' },
    ],
    blocks: { name: 'Slide', plural: 'Slides', max: MAX_HERO_SLIDES, titleKey: 'title', fields: [
      { key: 'title', label: 'Headline', kind: 'text', max: 100, required: true },
      { key: 'text', label: 'Text', kind: 'text', max: 200 },
      { key: 'label', label: 'Button', kind: 'text', max: 30 },
      { key: 'link', label: 'Button goes to', kind: 'link', default: '/shop' },
      ...picture(),
    ] },
  },
  {
    type: 'product-grid', name: 'Featured products', max: 4, description: 'Your products: featured, newest, or one collection. Layouts: 3 or 4 in a row, or a row you swipe.',
    fields: [
      { ...HEADING, default: 'Featured products' },
      { key: 'layout', label: 'Layout', kind: 'select', default: 'grid-4', options: sel(['grid-4', 'Grid, 4 in a row'], ['grid-3', 'Grid, 3 in a row'], ['carousel', 'One row to swipe']) },
      { key: 'source', label: 'Which products', kind: 'select', default: 'featured', options: sel(['featured', 'Featured first, then newest'], ['newest', 'Newest'], ['collection', 'One collection (choose below)']) },
      { key: 'collection', label: 'Collection', kind: 'collection', hint: 'Only used when “One collection” is chosen above.' },
      { key: 'count', label: 'How many', kind: 'select', default: '8', options: sel(['3', '3'], ['4', '4'], ['6', '6'], ['8', '8'], ['12', '12']) },
      { key: 'skipFirst', label: 'Leave out the top product', kind: 'check', default: false, hint: 'Use this when the hero already features it.' },
      { key: 'viewAll', label: 'Show a “View all” link', kind: 'check', default: true },
    ],
  },
  {
    type: 'category-list', name: 'Category grid', max: 1, description: 'Tiles for your shop categories, 2, 3 or 4 in a row.',
    fields: [{ ...HEADING, default: 'Shop by category' }, { key: 'columns', label: 'Layout', kind: 'select', default: '4', options: sel(['4', '4 in a row'], ['3', '3 in a row'], ['2', '2 in a row']) }],
  },
  {
    type: 'gallery', name: 'Gallery', max: 3, description: 'Your photos. Layouts: a grid of 2, 3 or 4, a masonry wall, or a row you swipe. Up to 30 pictures.',
    fields: [
      HEADING,
      { key: 'layout', label: 'Layout', kind: 'select', default: 'grid-3', options: sel(['grid-3', 'Grid, 3 in a row'], ['grid-2', 'Grid, 2 in a row'], ['grid-4', 'Grid, 4 in a row'], ['masonry', 'Masonry (pictures keep their own shape)'], ['carousel', 'One row to swipe']) },
      { key: 'ratio', label: 'Shape of the pictures', kind: 'ratio', default: '1:1', hint: 'Not used by the masonry layout.' },
    ],
    blocks: { name: 'Picture', plural: 'Pictures', max: MAX_GALLERY_IMAGES, titleKey: 'imageUrl', fields: [...picture(), { key: 'alt', label: 'What the picture shows', kind: 'text', max: 120, hint: 'One short line, read aloud to customers who cannot see it.' }] },
  },
  {
    type: 'story', name: 'Story / text', max: 4, description: 'Your story or any text. Layouts: beside a picture, on top of a picture, centred, or a timeline of up to 6 steps.',
    fields: [
      { key: 'layout', label: 'Layout', kind: 'select', default: 'split', options: sel(['split', 'Split: picture beside the text'], ['overlay', 'Text on top of a wide picture'], ['centered', 'Centred text, no picture'], ['timeline', 'Timeline (add the steps below)']) },
      { ...HEADING, default: 'Our story' },
      { key: 'text', label: 'Text', kind: 'textarea', max: 1200, hint: 'Leave an empty line between paragraphs.' },
      ...picture(),
      { key: 'imageSide', label: 'Picture side (split layout)', kind: 'select', default: 'left', options: sel(['left', 'Left'], ['right', 'Right']) },
      { key: 'ratio', label: 'Shape of the picture', kind: 'ratio', default: '4:5' },
      { key: 'buttonLabel', label: 'Link text (optional)', kind: 'text', max: 40 },
      { key: 'buttonLink', label: 'Link goes to', kind: 'link' },
    ],
    blocks: { name: 'Step', plural: 'Timeline steps', max: MAX_STORY_STEPS, titleKey: 'title', fields: [
      { key: 'title', label: 'Step heading', kind: 'text', max: 80, required: true },
      { key: 'text', label: 'Text', kind: 'textarea', max: 400 },
      ...picture('imageUrl', 'Picture (optional)'),
    ] },
  },
  {
    type: 'video', name: 'Video showcase', max: MAX_VIDEO_SECTIONS, description: 'One or two short videos (15 seconds, 10 MB each). They never start by themselves: the customer presses play.',
    fields: [
      HEADING,
      { key: 'layout', label: 'Layout', kind: 'select', default: 'single', options: sel(['single', 'One large video'], ['grid', 'Two side by side'], ['carousel', 'One row to swipe']) },
      { key: 'ratio', label: 'Shape of the videos', kind: 'ratio', default: '16:9' },
    ],
    blocks: { name: 'Video', plural: 'Videos', max: MAX_VIDEOS_PER_SECTION, titleKey: 'videoUrl', fields: [
      { key: 'videoUrl', label: 'Video', kind: 'video', hint: 'Up to 15 seconds and 10 MB.' },
      { key: 'posterUrl', label: 'Picture shown before it plays (optional)', kind: 'image' },
      { key: 'caption', label: 'Caption (optional)', kind: 'text', max: 120 },
    ] },
  },
  {
    type: 'reviews', name: 'Testimonials', max: 1, description: 'Your best real reviews, as cards, a row you swipe, or one large quote. Only reviews you approved are ever shown; none can be typed in here.',
    fields: [{ ...HEADING, default: 'What our customers say' }, { key: 'layout', label: 'Layout', kind: 'select', default: 'cards', options: sel(['cards', 'Cards'], ['carousel', 'One row to swipe'], ['single', 'One large quote']) }],
  },
  {
    type: 'banner', name: 'Banner / promo', max: 3, description: 'A promotion: a full-width strip, or text beside a picture with a button.',
    fields: [
      { key: 'layout', label: 'Layout', kind: 'select', default: 'strip', options: sel(['strip', 'Full-width strip'], ['split', 'Split: picture and text']) },
      { key: 'title', label: 'Headline', kind: 'text', max: 100, required: true, default: 'Free delivery this week' },
      { key: 'text', label: 'Text', kind: 'text', max: 200 },
      { key: 'label', label: 'Button', kind: 'text', max: 30, default: 'Shop now' },
      { key: 'link', label: 'Button goes to', kind: 'link', default: '/shop' },
      ...picture('imageUrl', 'Picture (split layout)'),
      { key: 'ratio', label: 'Shape of the picture', kind: 'ratio', default: '16:9' },
    ],
  },
  {
    type: 'cta', name: 'Newsletter / call to action', max: 2, description: 'A bold band with a button, or a box where customers leave their email. Centred, or beside a picture.',
    fields: [
      { key: 'layout', label: 'Layout', kind: 'select', default: 'centered', options: sel(['centered', 'Centred'], ['split', 'Split: with a picture']) },
      { ...HEADING, required: true, default: 'Ready to order?' },
      { key: 'text', label: 'Text', kind: 'text', max: 200 },
      { key: 'signup', label: 'Ask for the customer’s email instead of showing a button', kind: 'check', default: false, hint: 'Addresses are saved under Messages > Subscribers. Only write to people who asked to hear from you.' },
      { key: 'label', label: 'Button', kind: 'text', max: 30, default: 'Start shopping' },
      { key: 'link', label: 'Button goes to', kind: 'link', default: '/shop' },
      ...picture('imageUrl', 'Picture (split layout)'),
    ],
  },
  {
    type: 'faq', name: 'FAQ', max: 2, description: 'Common questions that open when tapped, in one or two columns.',
    fields: [{ ...HEADING, default: 'Questions, answered' }, { key: 'layout', label: 'Layout', kind: 'select', default: 'one', options: sel(['one', 'One column'], ['two', 'Two columns']) }],
    blocks: { name: 'Question', plural: 'Questions', max: 12, titleKey: 'q', fields: [
      { key: 'q', label: 'Question', kind: 'text', max: 140, required: true },
      { key: 'a', label: 'Answer', kind: 'textarea', max: 700 },
    ] },
  },
  // ---- classic sections: from before the ten-section library; kept so existing shops lose nothing
  {
    type: 'highlights', name: 'Highlights bar', max: 2, classic: true, description: 'Up to four short promises with an icon: delivery, cash on delivery, tracking…',
    fields: [],
    blocks: { name: 'Highlight', plural: 'Highlights', max: 4, titleKey: 'title', fields: [
      { key: 'icon', label: 'Icon', kind: 'select', default: 'check', options: ICONS.map((i) => ({ value: i, label: i[0].toUpperCase() + i.slice(1) })) },
      { key: 'title', label: 'Title', kind: 'text', max: 40, required: true },
      { key: 'text', label: 'Text', kind: 'text', max: 120 },
    ] },
  },
  {
    type: 'benefits', name: 'Benefits list', max: 2, classic: true, description: 'A ticked list of reasons to buy.',
    fields: [{ ...HEADING, default: 'Why customers choose us' }],
    blocks: { name: 'Benefit', plural: 'Benefits', max: 10, titleKey: 'text', fields: [{ key: 'text', label: 'Benefit', kind: 'text', max: 100, required: true }] },
  },
  { type: 'collection-list', name: 'Collections', max: 1, classic: true, description: 'Tiles for the collections you made by hand.', fields: [{ ...HEADING, default: 'Our collections' }] },
  // ---- the product page's own sections: they show the product the customer is looking at
  {
    type: 'product-main', name: 'Product photos and buy box', max: 1, only: 'product', required: true,
    description: 'The product’s photos beside its name, price, options and the order button. Always on the page.',
    fields: [
      { key: 'layout', label: 'Layout', kind: 'select', default: 'media-left', options: sel(['media-left', 'Photos on the left'], ['media-right', 'Photos on the right'], ['stacked', 'Photos on top, centred']) },
      { key: 'ratio', label: 'Shape of the main photo', kind: 'ratio', default: '1:1' },
      { key: 'background', label: 'Background', kind: 'select', default: 'tint', options: sel(['tint', 'Soft tint of your colour'], ['plain', 'Plain white']) },
      { key: 'breadcrumb', label: 'Show the path (Home / Shop / product)', kind: 'check', default: true },
      { key: 'stickyMedia', label: 'Keep the photos in view while the customer scrolls', kind: 'check', default: true, hint: 'On computers only.' },
    ],
  },
  {
    type: 'product-info', name: 'Description and details', max: 1, only: 'product',
    description: 'The product’s description, its extra details (ingredients, how to use…) and its reviews.',
    fields: [
      { key: 'layout', label: 'Layout', kind: 'select', default: 'tabs', options: sel(['tabs', 'Tabs'], ['accordion', 'Fold-out list'], ['stacked', 'One after another']) },
      { key: 'reviews', label: 'Include the reviews', kind: 'check', default: true, hint: 'Also needs “Show reviews” switched on under Settings.' },
    ],
  },
  { type: 'product-faq', name: 'Product questions', max: 1, only: 'product', description: 'The questions and answers you wrote for this product. Hidden for products that have none.', fields: [{ ...HEADING, hint: 'Empty = the heading you gave the product’s questions.' }] },
  {
    type: 'related-products', name: 'You may also like', max: 1, only: 'product', description: 'Other products from the same category.',
    fields: [
      { ...HEADING, default: 'You may also like' },
      { key: 'layout', label: 'Layout', kind: 'select', default: 'grid-4', options: sel(['grid-4', '4 columns'], ['grid-3', '3 columns'], ['carousel', 'Row to swipe']) },
      { key: 'count', label: 'How many', kind: 'select', default: '4', options: sel(['3', '3'], ['4', '4'], ['6', '6'], ['8', '8']) },
    ],
  },
  // ---- the collection page's own section
  {
    type: 'collection-main', name: 'Collection heading and products', max: 1, only: 'collection', required: true,
    description: 'The collection’s name, its description and its products in your order. Always on the page.',
    fields: [
      { key: 'layout', label: 'Heading', kind: 'select', default: 'centered', options: sel(['centered', 'Centred'], ['left', 'On the left'], ['compact', 'Small, no description']) },
      { key: 'columns', label: 'Products in a row (on computers)', kind: 'select', default: '4', options: sel(['4', '4'], ['3', '3'], ['2', '2']) },
      { key: 'background', label: 'Background', kind: 'select', default: 'tint', options: sel(['tint', 'Soft tint of your colour'], ['plain', 'Plain white']) },
      { key: 'breadcrumb', label: 'Show the path (Home / Shop)', kind: 'check', default: true },
      { key: 'count', label: 'Show how many products there are', kind: 'check', default: false },
    ],
  },
]
/** The ten sections of the library, without the classic ones. */
export const CORE_SECTIONS = SECTIONS.filter((x) => !x.classic && !x.only)
export const SECTION_BY_TYPE: ReadonlyMap<string, SectionDef> = new Map(SECTIONS.map((s) => [s.type, s]))

// ------------------------------------------------------------------ a template
export interface Block { id: string; settings: Settings }
export interface Section { id: string; type: string; hidden: boolean; settings: Settings; blocks: Block[] }
export interface Template { sections: Section[] }
export const TEMPLATE_TYPES = ['home', 'about', 'product', 'collection'] as const
export const TEMPLATE_LABEL: Record<(typeof TEMPLATE_TYPES)[number], string> = { home: 'Home page', about: 'About page', product: 'Product page', collection: 'Collection page' }
export const isTemplateType = (v: unknown): v is (typeof TEMPLATE_TYPES)[number] => (TEMPLATE_TYPES as readonly unknown[]).includes(v)
export type TemplateType = (typeof TEMPLATE_TYPES)[number]
export const MAX_SECTIONS = 25
/** The sections a kind of page may use: the general ones, plus that page's own. */
export const sectionsFor = (page: TemplateType): SectionDef[] => SECTIONS.filter((d) => !d.only || d.only === page)
const allowedOn = (def: SectionDef, page: TemplateType | undefined) => !def.only || def.only === page

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const idOk = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(v)
const hasMarkup = (s: string) => /[<>]/.test(s)

/** The value a field starts with. */
export function fieldDefault(f: Field): Value {
  if (f.kind === 'check') return f.default
  if (f.kind === 'select' || f.kind === 'ratio') return f.default
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
  if (f.kind === 'ratio') return { value: text in RATIOS ? text : f.default } // never anything but a preset
  if (f.kind === 'focal') {
    const m = /^(\d{1,3}),(\d{1,3})$/.exec(text)
    return { value: m && Number(m[1]) <= 100 && Number(m[2]) <= 100 ? `${Number(m[1])},${Number(m[2])}` : '' } // unset = the centre
  }
  if (f.kind === 'image' || f.kind === 'link' || f.kind === 'video') {
    const u = safeUrl(text.slice(0, 500), f.kind === 'link')
    const wrongFile = f.kind === 'video' && !!u && !/\.(mp4|webm)(\?|$)/i.test(u)
    if (u !== null && !wrongFile) return { value: u }
    return strict ? { error: `${f.label} must start with https://${f.kind === 'link' ? ' or be a page of your shop like /shop' : f.kind === 'video' ? ' and end in .mp4 or .webm' : ' (an image address)'}.` } : { value: '' }
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

/**
 * Sections saved before the ten-section library are read as their new equivalent, so no saved page loses anything:
 * "picture with text" and "text" both became layouts of Story.
 */
function upgrade(item: unknown): unknown {
  const s = obj(item), st = obj(s.settings)
  if (s.type === 'image-text') return { ...s, type: 'story', settings: { ...st, layout: st.imageUrl ? 'split' : 'centered' } }
  if (s.type === 'rich-text') return { ...s, type: 'story', settings: { ...st, layout: 'centered' } }
  return item
}

function clean(raw: unknown, strict: boolean, page?: TemplateType): { ok: true; value: Template } | { ok: false; error: string } {
  const list = (Array.isArray(obj(raw).sections) ? (obj(raw).sections as unknown[]) : []).map(upgrade)
  if (strict && list.length > MAX_SECTIONS) return { ok: false, error: `A page can have at most ${MAX_SECTIONS} sections.` }
  const sections: Section[] = [], seen = new Set<string>(), perType = new Map<string, number>()
  for (const item of list.slice(0, MAX_SECTIONS)) {
    const s = obj(item), def = SECTION_BY_TYPE.get(String(s.type))
    if (!def) { if (strict) return { ok: false, error: 'This page contains a section that does not exist any more. Reload the page.' }; continue }
    if (!allowedOn(def, page)) { if (strict) return { ok: false, error: `“${def.name}” cannot be used on this page.` }; continue }
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
        // When saving, a block must have its main thing (a gallery picture needs a picture, a video block a video).
        const main = def.blocks.fields.find((f) => f.key === def.blocks!.titleKey)!
        if (strict && !String(bs.value[main.key] ?? '').trim()) return { ok: false, error: `${def.name}, ${def.blocks.name.toLowerCase()} ${i + 1}: add the ${main.label.toLowerCase().replace(/ \(.*\)$/, '')}, or remove this ${def.blocks.name.toLowerCase()}.` }
        // A block whose naming field is empty says nothing: it is dropped when reading (and refused above when saving).
        if (!strict && !String(bs.value[def.blocks.titleKey] ?? '').trim()) continue
        const bid = idOk(bo.id) && !blockIds.has(bo.id) ? bo.id : `b${i + 1}x${blocks.length}`
        blockIds.add(bid); blocks.push({ id: bid, settings: bs.value })
      }
    }
    seen.add(id); perType.set(def.type, n)
    sections.push({ id, type: def.type, hidden: s.hidden === true && !def.required, settings: settings.value, blocks })
  }
  // The heart of a page is always there: put back if a stored page lost it, refused if the editor sent a page without it.
  for (const def of SECTIONS) {
    if (!def.required || def.only !== page || sections.some((x) => x.type === def.type)) continue
    if (strict) return { ok: false, error: `“${def.name}” must stay on the ${TEMPLATE_LABEL[page!].toLowerCase()}.` }
    sections.unshift(newSection(def.type, `${def.type}-1`)!)
  }
  return { ok: true, value: { sections } }
}

/** Reading what is stored: never fails, drops what it does not understand. */
export const readTemplate = (raw: unknown, page: TemplateType = 'home'): Template => (clean(raw, false, page) as { ok: true; value: Template }).value
/** Saving what the editor sent: the first problem is reported in plain words and nothing is saved. */
export const parseTemplate = (raw: unknown, page: TemplateType = 'home') => clean(raw, true, page)

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
  if (!single) add('category-list', { title: 'Shop by category', columns: '4' }, [], !c.show.categories)
  add('product-grid', single ? { title: 'Also available', layout: 'grid-4', source: 'featured', collection: '', count: '4', skipFirst: true, viewAll: false } : { title: 'Featured products', layout: 'grid-4', source: 'featured', collection: '', count: '8', skipFirst: false, viewAll: true }, [], !c.show.featured)
  if (c.story.text || c.story.imageUrl) add('story', { layout: c.story.imageUrl ? 'split' : 'centered', title: c.story.title, text: c.story.text, imageUrl: c.story.imageUrl, imageSide: 'left', ratio: '4:5', buttonLabel: 'Read more about us', buttonLink: '/about' }, [], !c.show.story)
  if (c.benefits.items.length) add('benefits', { title: c.benefits.title }, c.benefits.items.map((text) => ({ text })), !c.show.benefits)
  add('reviews', { title: 'What our customers say', layout: 'cards' }, [], !c.show.reviews)
  if (c.faq.length) add('faq', { title: 'Questions, answered', layout: 'one' }, c.faq.map((f) => ({ q: f.q, a: f.a })), !c.show.faq)
  add('cta', { layout: 'centered', title: c.cta.title, text: c.cta.text, signup: false, label: c.cta.label, link: '/shop' }, [], !c.show.cta)
  return readTemplate({ sections: out })
}

/**
 * The About page as a template, made from the store's old About settings: a centred welcome with the heading,
 * the owner's text, their highlights, and a way on to the shop. About is not special code: it is drawn by the
 * same sections as the home page.
 */
export function aboutFromLegacy(c: StorefrontContent, storeName: string): Template {
  return readTemplate({ sections: [
    { id: 'hero-1', type: 'hero', settings: { layout: 'centered', title: c.about.title, primaryLabel: '', secondaryLabel: '', showRating: false, spotlight: false } },
    { id: 'story-1', type: 'story', settings: { layout: 'centered', title: '', text: c.about.body || `${storeName} is a Pakistani online store. Browse the shop or send us a message if you have a question.`, buttonLabel: 'Contact us', buttonLink: '/contact' } },
    ...(c.trust.length ? [{ id: 'highlights-1', type: 'highlights', blocks: c.trust.map((t, i) => ({ id: `b${i + 1}`, settings: { icon: t.icon, title: t.title, text: t.text } })) }] : []),
    { id: 'cta-1', type: 'cta', settings: { layout: 'centered', title: 'Have a look around', text: '', signup: false, label: 'Visit the shop', link: '/shop' } },
  ] })
}
/** The template a store gets for a page before it saves one of its own. */
/** The product and collection pages as every shop had them before they could be designed: the same parts in the same order. */
export const DEFAULT_PAGES: Record<'product' | 'collection', () => Template> = {
  product: () => ({ sections: ['product-main', 'product-info', 'product-faq', 'related-products'].map((t) => newSection(t, `${t}-1`)!) }),
  collection: () => ({ sections: [newSection('collection-main', 'collection-main-1')!] }),
}
export const legacyTemplate = (type: TemplateType, c: StorefrontContent, storeName: string): Template =>
  type === 'about' ? aboutFromLegacy(c, storeName) : type === 'home' ? templateFromLegacy(c) : DEFAULT_PAGES[type]()

// ------------------------------------------------------------------ guard rails for the editor
export interface PageWarning { sectionId: string | null; text: string }
const isHeavy = (kind: Field['kind']) => kind === 'image' || kind === 'video'
/** Every picture and video address a section uses (its own and its blocks'), in order. */
export function sectionMedia(s: Section): string[] {
  const def = SECTION_BY_TYPE.get(s.type)
  if (!def) return []
  const from = (fields: Field[], st: Settings) => fields.filter((f) => isHeavy(f.kind)).map((f) => String(st[f.key] ?? '')).filter(Boolean)
  return [...from(def.fields, s.settings), ...s.blocks.flatMap((b) => from(def.blocks?.fields ?? [], b.settings))]
}
/**
 * Friendly warnings for the editor (never a refusal): a heavy top of the page, a long gallery, a video up top.
 * `bytes` = the size of each file we know about (uploads); files pasted as an address have no known size.
 */
export function pageWarnings(t: Template, bytes: Record<string, number> = {}): PageWarning[] {
  const out: PageWarning[] = []
  const visible = t.sections.filter((s) => !s.hidden)
  const top = visible[0]
  if (top) {
    // What a visitor's phone must download before anything else: the first section's first picture or video.
    const first = top.type === 'gallery' ? sectionMedia(top).slice(0, GALLERY_FOLD) : sectionMedia(top).slice(0, top.type === 'hero' && top.settings.layout === 'carousel' ? 1 : 2)
    const weight = first.reduce((n, u) => n + (bytes[u] ?? 0), 0)
    if (weight > FOLD_BUDGET_BYTES) out.push({ sectionId: top.id, text: `The top of this page is heavy (about ${(weight / 1024 / 1024).toFixed(1)} MB before anything shows). Use a smaller picture or a shorter video so the shop opens quickly on mobile data.` })
    if (top.type === 'video') out.push({ sectionId: top.id, text: 'A video is the first thing on this page. A hero or a picture opens faster; consider moving the video lower.' })
  }
  for (const s of visible) {
    if (s.type === 'gallery' && s.blocks.length > GALLERY_FOLD && s.settings.layout !== 'carousel') out.push({ sectionId: s.id, text: `This gallery has ${s.blocks.length} pictures. The first ${GALLERY_FOLD} are shown; customers press “Show all” for the rest, so the page stays fast.` })
    if (s.type === 'hero' && s.settings.layout === 'video' && !s.settings.videoUrl) out.push({ sectionId: s.id, text: 'The hero uses the video layout but has no video yet, so it shows the picture.' })
    if (s.type === 'hero' && s.settings.layout === 'video' && !s.settings.imageUrl) out.push({ sectionId: s.id, text: 'Add a picture to the video hero: phones show the picture instead of the video.' })
    if (s.type === 'hero' && s.settings.layout === 'carousel' && s.blocks.length === 0) out.push({ sectionId: s.id, text: 'The hero uses the slides layout but has no slides yet. Add up to 3 below.' })
    if (s.type === 'story' && s.settings.layout === 'timeline' && s.blocks.length === 0) out.push({ sectionId: s.id, text: 'The story uses the timeline layout but has no steps yet.' })
  }
  return out
}

/** Every video address a page uses (the hero's background video and the Video sections' clips), hidden sections included. */
export function templateVideos(t: Template): string[] {
  const from = (fields: Field[], st: Settings) => fields.filter((f) => f.kind === 'video').map((f) => String(st[f.key] ?? '')).filter(Boolean)
  return t.sections.flatMap((s) => {
    const def = SECTION_BY_TYPE.get(s.type)
    return def ? [...from(def.fields, s.settings), ...s.blocks.flatMap((b) => from(def.blocks?.fields ?? [], b.settings))] : []
  })
}

/**
 * The verdict on one video for a theme section: at most 15 seconds and 10 MB, MP4 or WebM. `bytes` and `duration`
 * must come from the file host (Cloudinary), not from the browser.
 */
export function videoVerdict(v: { bytes: number | null; duration: number | null; format: string }): { ok: true } | { ok: false; error: string } {
  if (!['mp4', 'webm'].includes(v.format.toLowerCase())) return { ok: false, error: 'Section videos must be MP4 or WebM files. Save the video as MP4 and upload it again.' }
  if (v.bytes === null || !(v.bytes > 0) || v.duration === null || !(v.duration > 0)) return { ok: false, error: 'The length or size of this video could not be read, so it cannot be used in a section. Try uploading it again as an MP4.' }
  if (v.duration > VIDEO_MAX_SECONDS + 0.5) return { ok: false, error: `This video is ${Math.round(v.duration)} seconds long. Section videos can be at most ${VIDEO_MAX_SECONDS} seconds, so the page stays fast. Trim it and upload again.` }
  if (v.bytes > VIDEO_MAX_BYTES) return { ok: false, error: `This video is ${(v.bytes / 1024 / 1024).toFixed(1)} MB. Section videos can be at most ${VIDEO_MAX_BYTES / 1024 / 1024} MB. Export it smaller (720p is plenty) and upload again.` }
  return { ok: true }
}

/** Reads the size and length out of Cloudinary's description of a file. Unknown values come back as null, never a guess. */
export function readCloudDetails(raw: unknown): { bytes: number | null; duration: number | null; format: string } {
  const o = obj(raw), num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
  return { bytes: num(o.bytes), duration: num(o.duration) ?? num(obj(o.video).duration) ?? num(obj(o.media_metadata).duration), format: typeof o.format === 'string' ? o.format : '' }
}
