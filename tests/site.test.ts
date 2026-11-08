import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SITE, faqToText, featuresToText, parseFaq, parseFeatures, parseSiteForm, readSite } from '@/lib/site/rules'

const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null })

test('reading stored content: damaged or empty falls back to the built-in text', () => {
  assert.deepEqual(readSite(null), DEFAULT_SITE)
  assert.deepEqual(readSite('garbage'), DEFAULT_SITE)
  assert.deepEqual(readSite({ features: [], faq: 'x', worksWith: [] }), DEFAULT_SITE)
  const r = readSite({ heroTitle: '  New headline  ', features: [{ icon: 'nope', title: 'A', text: 'B' }, { title: '', text: 'x' }, 7], sections: { faq: false, clients: 'yes' }, showStoreCount: 'true' })
  assert.equal(r.heroTitle, 'New headline')
  assert.deepEqual(r.features, [{ icon: 'star', title: 'A', text: 'B' }]) // unknown icon -> star; empty/garbage rows dropped
  assert.equal(r.sections.faq, false)
  assert.equal(r.sections.clients, true) // only a real boolean counts
  assert.equal(r.showStoreCount, false) // only a real true counts
})

test('lists round-trip through the editor text', () => {
  const f = parseFeatures(featuresToText(DEFAULT_SITE.features))
  assert.deepEqual(f.ok && f.value, DEFAULT_SITE.features)
  const q = parseFaq(faqToText(DEFAULT_SITE.faq))
  assert.deepEqual(q.ok && q.value, DEFAULT_SITE.faq)
})

test('feature lines are validated', () => {
  assert.equal(parseFeatures('truck | Couriers | Book and track').ok, true)
  assert.equal(parseFeatures('truck | Couriers | Use A | or B').ok && true, true) // extra bars stay in the text
  for (const bad of ['', 'rocket | T | x', 'truck | | x', 'truck | T |', 'truck | <b>T</b> | x', `truck | ${'T'.repeat(61)} | x`, 'truck only']) assert.equal(parseFeatures(bad).ok, false, bad)
  assert.equal(parseFeatures(Array.from({ length: 13 }, (_, i) => `star | T${i} | x`).join('\n')).ok, false)
})

test('faq lines are validated', () => {
  assert.equal(parseFaq('Why? | Because.').ok, true)
  for (const bad of ['', 'No answer', '| answer', 'Q | <script>', `${'Q'.repeat(121)} | a`]) assert.equal(parseFaq(bad).ok, false, bad)
})

test('the site form', () => {
  const base = { heroBadge: 'Badge', heroTitle: 'A headline', heroText: 'Some text here', ctaNote: '', featuresTitle: 'Features', featuresIntro: '', clientsTitle: 'Clients', worksWith: 'COD, JazzCash', features: 'star | T | x', faq: 'Q | A', sec_features: 'on', showStoreCount: 'on' }
  const ok = parseSiteForm(form(base))
  assert.equal(ok.ok, true)
  if (ok.ok) { assert.deepEqual(ok.value.worksWith, ['COD', 'JazzCash']); assert.equal(ok.value.sections.faq, false); assert.equal(ok.value.sections.features, true); assert.equal(ok.value.showStoreCount, true) }
  const bad = (o: Record<string, string>) => parseSiteForm(form({ ...base, ...o })).ok
  assert.equal(bad({ heroTitle: 'x' }), false)
  assert.equal(bad({ heroTitle: '<h1>x</h1>' }), false)
  assert.equal(bad({ worksWith: '' }), false)
  assert.equal(bad({ worksWith: 'a'.repeat(31) }), false)
  assert.equal(bad({ features: 'bad line' }), false)
  assert.equal(bad({ faq: '' }), false)
})
