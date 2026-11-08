import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyPart, COLORS, defaultStorefront, faqToText, paragraphs, PALETTES, readStorefront, safeUrl } from '@/lib/storefront/rules'
import { PRESETS, presetContent, type PresetKey } from '@/lib/storefront/presets'

const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null })
const cur = defaultStorefront('Khaadi Home')

test('defaults are made from the store name, never another brand', () => {
  const d = defaultStorefront('Khaadi Home')
  assert.match(d.hero.title, /Khaadi Home/)
  assert.equal(JSON.stringify(d).toLowerCase().includes('darwaish'), false)
  assert.equal(JSON.stringify(defaultStorefront('')).includes('Our store'), true)
})

test('reading is defensive: junk falls back, good parts stay', () => {
  assert.deepEqual(readStorefront(null, 'S'), defaultStorefront('S'))
  assert.deepEqual(readStorefront('x', 'S'), defaultStorefront('S'))
  const r = readStorefront({ layout: 'WEIRD', color: 'rose', font: 5, hero: { title: '  Hello  ', imageUrl: 'javascript:alert(1)', secondaryLink: '//evil.com' }, trust: [{ icon: 'nope', title: 'T', text: 'x' }, { title: '' }, 3], show: { faq: false, cta: 'yes' }, social: { instagram: 'http://insecure.com', facebook: 'https://facebook.com/x' } }, 'S')
  assert.equal(r.layout, 'CATALOG'); assert.equal(r.color, 'rose'); assert.equal(r.font, 'sans')
  assert.equal(r.hero.title, 'Hello'); assert.equal(r.hero.imageUrl, ''); assert.equal(r.hero.secondaryLink, '/about')
  assert.deepEqual(r.trust, [{ icon: 'check', title: 'T', text: 'x' }])
  assert.equal(r.show.faq, false); assert.equal(r.show.cta, true)
  assert.equal(r.social.instagram, ''); assert.equal(r.social.facebook, 'https://facebook.com/x')
})

test('urls: https or a shop path only', () => {
  assert.equal(safeUrl('https://a.com/x.png', false), 'https://a.com/x.png')
  assert.equal(safeUrl('/shop'), '/shop'); assert.equal(safeUrl('/shop', false), null)
  assert.equal(safeUrl(''), '')
  for (const b of ['http://a.com', 'javascript:x', 'data:text/html,x', '//evil.com', 'a.com']) assert.equal(safeUrl(b), null, b)
})

test('palettes are complete', () => {
  for (const c of COLORS) for (const k of ['c50', 'c100', 'c200', 'c600', 'c700', 'c800'] as const) assert.match(PALETTES[c][k], /^#[0-9a-f]{6}$/)
})

test('look form', () => {
  const ok = applyPart('look', form({ layout: 'SINGLE_PRODUCT', color: 'indigo', font: 'serif', tagline: 'Fresh daily', announcementText: 'Eid sale', announcementLink: '/shop', instagram: 'https://instagram.com/x' }), cur)
  assert.equal(ok.ok, true)
  if (ok.ok) { assert.equal(ok.value.layout, 'SINGLE_PRODUCT'); assert.equal(ok.value.announcement.link, '/shop'); assert.equal(ok.value.social.instagram, 'https://instagram.com/x') }
  const noText = applyPart('look', form({ announcementLink: '/shop' }), cur)
  assert.equal(noText.ok && noText.value.announcement.link, '') // a link without text is dropped
  const looks: Record<string, string>[] = [{ tagline: 'x'.repeat(81) }, { announcementText: '<b>x</b>' }, { announcementText: 'ok', announcementLink: 'javascript:x' }, { facebook: 'http://x.com' }]
  for (const b of looks) assert.equal(applyPart('look', form(b), cur).ok, false, JSON.stringify(b))
  assert.equal(applyPart('look', form({ layout: 'x', color: 'x', font: 'x' }), cur).ok, true) // unknown choices keep the current ones
})

test('home form', () => {
  const base = { heroTitle: 'Big headline', heroPrimary: 'Shop now', storyTitle: 'Our story', ctaTitle: 'Ready?', ctaLabel: 'Go', benefitsTitle: 'Why us', show_faq: 'on' }
  const ok = applyPart('home', form({ ...base, benefitItems: 'One\nTwo\n', trustTitle0: 'Fast', trustText0: 'Quick', trustIcon0: 'truck', storyText: 'Long story' }), cur)
  assert.equal(ok.ok, true)
  if (ok.ok) { assert.deepEqual(ok.value.benefits.items, ['One', 'Two']); assert.equal(ok.value.trust.length, 1); assert.equal(ok.value.show.faq, true); assert.equal(ok.value.show.cta, false) }
  const bad = (o: Record<string, string>) => applyPart('home', form({ ...base, ...o }), cur).ok
  assert.equal(bad({}), true)
  assert.equal(bad({ heroTitle: 'x' }), false)
  assert.equal(bad({ heroTitle: '<h1>x</h1>' }), false)
  assert.equal(bad({ heroImage: 'http://a.com/x.png' }), false)
  assert.equal(bad({ benefitItems: Array.from({ length: 11 }, (_, i) => `b${i}`).join('\n') }), false)
  assert.equal(bad({ trustTitle0: 'x'.repeat(41) }), false)
  assert.equal(bad({ storyText: 'x'.repeat(1201) }), false)
})

test('pages form and paragraphs', () => {
  const ok = applyPart('pages', form({ aboutTitle: 'About us', aboutBody: 'One.\n\nTwo.', contactIntro: 'Hi', contactAddress: 'Lahore', contactHours: '10-6', policy_shipping: 'We ship.' }), cur)
  assert.equal(ok.ok, true)
  if (ok.ok) assert.equal(ok.value.policies.shipping, 'We ship.')
  assert.equal(applyPart('pages', form({ aboutTitle: 'About us', aboutBody: '<script>' }), cur).ok, false)
  assert.equal(applyPart('pages', form({ aboutTitle: 'About us', policy_terms: 'x'.repeat(6001) }), cur).ok, false)
  assert.deepEqual(paragraphs('A line\nsame para\n\n\nSecond'), ['A line same para', 'Second'])
})

test('faq form round-trips', () => {
  const r = applyPart('faq', form({ faq: faqToText(cur.faq) }), cur)
  assert.deepEqual(r.ok && r.value.faq, cur.faq)
  for (const b of ['No bar here', '| answer', 'Q | <b>x</b>', Array.from({ length: 13 }, (_, i) => `Q${i} | A`).join('\n')]) assert.equal(applyPart('faq', form({ faq: b }), cur).ok, false, b)
})

test('presets: the original single-product model is preserved', () => {
  assert.deepEqual(Object.keys(PRESETS).sort(), ['GENERAL', 'SINGLE_PRODUCT'])
  const o = presetContent('SINGLE_PRODUCT', 'Darwaish®')
  assert.equal(o.layout, 'SINGLE_PRODUCT'); assert.equal(o.color, 'amber')
  assert.match(o.hero.subtitle, /Sacred Oil/); assert.ok(o.benefits.items.length >= 5)
  assert.equal(JSON.stringify(o).includes('23 kits'), false) // no invented scarcity
  for (const k of Object.keys(PRESETS) as PresetKey[]) assert.deepEqual(readStorefront(presetContent(k, 'S'), 'S'), presetContent(k, 'S')) // every preset survives validation unchanged
})
