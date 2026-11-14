import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_SECTIONS, SECTIONS, SECTION_BY_TYPE, fieldDefault, newBlock, newSection, parseTemplate, readTemplate, sectionSummary, templateFromLegacy } from '@/lib/theme/schema'
import { MIN_CONTRAST, contrastWithWhite, normalizeHex, parseCustomColor, parseThemeName, readThemeSettings, shadesFromHex, themeShades, themeVariables } from '@/lib/theme/settings'
import { THEME_PRESETS, themePreset, type ThemePresetKey } from '@/lib/theme/presets'
import { PALETTES, defaultStorefront } from '@/lib/storefront/rules'
import { presetContent } from '@/lib/storefront/presets'

test('section library: every section is well described (the editor builds its forms from this)', () => {
  assert.ok(SECTIONS.length >= 10)
  assert.equal(new Set(SECTIONS.map((s) => s.type)).size, SECTIONS.length, 'types are unique')
  for (const s of SECTIONS) {
    assert.match(s.type, /^[a-z-]+$/); assert.ok(s.name && s.description && s.max >= 1, s.type)
    for (const fields of [s.fields, s.blocks?.fields ?? []]) {
      assert.equal(new Set(fields.map((f) => f.key)).size, fields.length, `${s.type}: field keys are unique`)
      for (const f of fields) {
        assert.ok(f.label, `${s.type}.${f.key}`)
        if (f.kind === 'select') assert.ok(f.options.some((o) => o.value === f.default), `${s.type}.${f.key}: default is one of the options`)
        if (f.kind === 'text' || f.kind === 'textarea') assert.ok(f.max > 0 && String(fieldDefault(f)).length <= f.max)
      }
    }
    if (s.blocks) assert.ok(s.blocks.fields.some((f) => f.key === s.blocks!.titleKey) && s.blocks.max >= 1, `${s.type}: blocks`)
    // A brand new section of every type is valid as it comes.
    const fresh = newSection(s.type, 'x1')!
    const withBlock = s.blocks ? { ...fresh, blocks: [{ id: 'b1', settings: { ...newBlock(s.blocks, 'b1').settings, [s.blocks.titleKey]: 'Something' } }] } : fresh
    assert.deepEqual(parseTemplate({ sections: [withBlock] }), { ok: true, value: { sections: [withBlock] } }, s.type)
  }
  assert.equal(newSection('nope', 'x'), null)
})

test('reading a stored template never fails: unknown and damaged parts are dropped, the rest is kept', () => {
  for (const junk of [null, undefined, 'x', 42, [], {}, { sections: 'no' }, { sections: [null, 5, 'a', {}] }]) assert.deepEqual(readTemplate(junk), { sections: [] })
  const t = readTemplate({ sections: [
    { id: 'a', type: 'hero', settings: { title: '  Hello   there ', layout: 'sideways', spotlight: 'yes', imageUrl: 'javascript:alert(1)', primaryLink: '//evil.com', extra: 'dropped', text: '<script>x</script>hi' } },
    { id: 'a', type: 'cta', settings: {} }, // the same id twice: dropped
    { id: 'b', type: 'not-a-section', settings: {} },
    { id: 'c', type: 'faq', settings: { title: 'Q' }, blocks: [{ id: 'q1', settings: { q: 'How long?', a: 'Two days' } }, { settings: { q: '', a: 'no question' } }, 'junk'] },
    { id: 'd', type: 'reviews', hidden: true }, { id: 'e', type: 'reviews' }, // only one reviews section allowed
  ] })
  assert.deepEqual(t.sections.map((s) => s.id), ['a', 'c', 'd'])
  const hero = t.sections[0].settings
  assert.equal(hero.title, 'Hello there'); assert.equal(hero.layout, 'image-right'); assert.equal(hero.spotlight, false)
  assert.equal(hero.imageUrl, ''); assert.equal(hero.primaryLink, ''); assert.equal('extra' in hero, false)
  assert.equal(hero.text, 'scriptx/scripthi', 'markup characters are removed, so nothing can run')
  assert.deepEqual(t.sections[1].blocks, [{ id: 'q1', settings: { q: 'How long?', a: 'Two days' } }])
  assert.equal(t.sections[2].hidden, true)
  assert.equal(readTemplate({ sections: Array.from({ length: 60 }, (_, i) => ({ id: `s${i}`, type: 'hero' })) }).sections.length, 2, 'per-type limit')
  assert.deepEqual(readTemplate(readTemplate(t)), t, 'reading is stable')
})

test('saving a template: the first problem is reported in plain words', () => {
  const hero = (settings: object) => ({ sections: [{ id: 'h', type: 'hero', settings: { title: 'Hi', layout: 'centered', ...settings } }] })
  const err = (raw: unknown) => { const r = parseTemplate(raw); assert.equal(r.ok, false); return r.ok ? '' : r.error }
  assert.equal(parseTemplate(hero({})).ok, true)
  assert.match(err(hero({ title: '' })), /Hero banner: Headline cannot be empty/)
  assert.match(err(hero({ title: 'x'.repeat(121) })), /120 characters or fewer/)
  assert.match(err(hero({ text: 'a <b> c' })), /do not use < or >/)
  assert.match(err(hero({ imageUrl: 'http://x.pk/a.jpg' })), /Picture must start with https:\/\//)
  assert.match(err(hero({ primaryLink: 'javascript:alert(1)' })), /page of your shop like \/shop/)
  assert.match(err(hero({ layout: 'sideways' })), /choose one of the options/)
  assert.match(err({ sections: [{ id: 'x', type: 'gone' }] }), /does not exist any more/)
  assert.match(err({ sections: [{ id: 'a', type: 'reviews' }, { id: 'b', type: 'reviews' }] }), /at most once/)
  assert.match(err({ sections: [{ id: 'a', type: 'cta', settings: { title: 'T' } }, { id: 'a', type: 'cta', settings: { title: 'T' } }] }), /could not be read/)
  assert.match(err({ sections: Array.from({ length: MAX_SECTIONS + 1 }, (_, i) => ({ id: `s${i}`, type: 'hero' })) }), /at most 25 sections/)
  assert.match(err({ sections: [{ id: 'f', type: 'faq', settings: {}, blocks: [{ id: 'b', settings: { q: '', a: 'x' } }] }] }), /question 1: Question cannot be empty/)
  assert.match(err({ sections: [{ id: 'h', type: 'highlights', blocks: Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, settings: { title: 'T', icon: 'check' } })) }] }), /at most 4 highlights/)
  const ok = parseTemplate({ sections: [{ id: 'g', type: 'product-grid', settings: { title: 'New', source: 'collection', collection: 'eid-2026', count: '12', viewAll: false } }] })
  assert.ok(ok.ok && ok.value.sections[0].settings.collection === 'eid-2026' && ok.value.sections[0].settings.viewAll === false && ok.value.sections[0].settings.skipFirst === false, 'an unticked box stays unticked; a missing one takes its starting value')
  assert.ok(parseTemplate({ sections: [] }).ok, 'an empty page is allowed')
})

test('old shops keep their home page: the old settings become the same sections in the same order', () => {
  const cat = templateFromLegacy(defaultStorefront('Ali Store'))
  assert.deepEqual(cat.sections.map((s) => s.type), ['hero', 'highlights', 'category-list', 'product-grid', 'reviews', 'faq', 'cta'])
  assert.equal(cat.sections[0].settings.title, 'Welcome to Ali Store'); assert.equal(cat.sections[0].settings.spotlight, false)
  assert.equal(cat.sections[1].blocks.length, 4); assert.equal(cat.sections[5].blocks.length, 3)
  assert.ok(cat.sections.every((s) => !s.hidden))
  const one = templateFromLegacy(presetContent('SINGLE_PRODUCT', 'Darwaish'))
  assert.deepEqual(one.sections.map((s) => s.type), ['hero', 'highlights', 'product-grid', 'image-text', 'benefits', 'reviews', 'faq', 'cta'])
  assert.equal(one.sections[0].settings.spotlight, true)
  assert.deepEqual([one.sections[2].settings.title, one.sections[2].settings.skipFirst, one.sections[2].settings.count], ['Also available', true, '4'])
  assert.equal(one.sections[4].blocks.length, 5); assert.equal(one.sections[3].settings.title, 'A legacy of healing')
  const off = defaultStorefront('S'); off.show.faq = false; off.show.featured = false
  const hidden = templateFromLegacy(off)
  assert.deepEqual(hidden.sections.filter((s) => s.hidden).map((s) => s.type), ['product-grid', 'faq'], 'switched-off parts stay, hidden')
  for (const t of [cat, one, hidden]) assert.deepEqual(parseTemplate(t), { ok: true, value: t }, 'a converted page can be saved unchanged')
  assert.equal(sectionSummary(cat.sections[0]), 'Hero banner: Welcome to Ali Store'); assert.equal(sectionSummary(cat.sections[1]), 'Highlights bar')
})

test('brand colour: six shades from one colour; too-light colours are refused so buttons stay readable', () => {
  assert.equal(normalizeHex(' #1A7F5A '), '#1a7f5a'); assert.equal(normalizeHex('#abc'), '#aabbcc'); assert.equal(normalizeHex('green'), null); assert.equal(normalizeHex('#12345'), null)
  const s = shadesFromHex('#1a7f5a')
  assert.equal(s.c700, '#1a7f5a')
  for (const v of Object.values(s)) assert.match(v, /^#[0-9a-f]{6}$/)
  assert.ok(contrastWithWhite(s.c800) > contrastWithWhite(s.c700) && contrastWithWhite(s.c700) > contrastWithWhite(s.c600), 'darker, base, lighter')
  assert.ok(contrastWithWhite(s.c50) < 1.2 && contrastWithWhite(s.c200) < 2, 'the tints are pale')
  assert.equal(Math.round(contrastWithWhite('#000000')), 21); assert.equal(Math.round(contrastWithWhite('#ffffff')), 1)
  assert.deepEqual(parseCustomColor(''), { ok: true, value: '' })
  assert.deepEqual(parseCustomColor('#1A7F5A'), { ok: true, value: '#1a7f5a' })
  assert.match((parseCustomColor('#ffe066') as { error: string }).error, /too light/)
  assert.match((parseCustomColor('teal') as { error: string }).error, /like #1a7f5a/)
  // Every ready palette passes the same readability rule the custom colour must pass.
  for (const [k, p] of Object.entries(PALETTES)) assert.ok(contrastWithWhite(p.c700) >= MIN_CONTRAST, k)
})

test('theme settings: read defensively, custom colour wins, CSS variables complete', () => {
  assert.deepEqual(readThemeSettings(null), { color: 'emerald', customColor: '', font: 'sans' })
  assert.deepEqual(readThemeSettings({ color: 'neon', font: 'comic', customColor: '#ffffff' }, { color: 'amber', customColor: '', font: 'serif' }), { color: 'amber', customColor: '', font: 'serif' })
  const s = readThemeSettings({ color: 'rose', customColor: '#123456', font: 'serif' })
  assert.equal(themeShades(s).c700, '#123456')
  assert.equal(themeShades({ ...s, customColor: '' }).c700, PALETTES.rose.c700)
  const v = themeVariables(s)
  assert.deepEqual(Object.keys(v), ['--c-50', '--c-100', '--c-200', '--c-600', '--c-700', '--c-800', '--heading-font'])
  assert.equal(v['--heading-font'], 'var(--font-playfair)')
  assert.deepEqual(parseThemeName('  Eid   sale '), { ok: true, value: 'Eid sale' })
  for (const bad of ['', 'x', 'a'.repeat(51), '<b>hi</b>']) assert.equal(parseThemeName(bad).ok, false)
})

test('ready-made themes are valid and different', () => {
  const types = (k: ThemePresetKey) => themePreset(k, 'Ali Store').home.sections.map((s) => s.type)
  for (const k of Object.keys(THEME_PRESETS) as ThemePresetKey[]) {
    const p = themePreset(k, 'Ali Store')
    assert.deepEqual(parseTemplate(p.home), { ok: true, value: p.home }, k)
    assert.deepEqual(readThemeSettings(p.settings), p.settings, k)
    assert.ok(p.home.sections.length >= 3 && p.home.sections[0].type === 'hero', k)
    assert.ok(p.home.sections.every((s) => SECTION_BY_TYPE.has(s.type)))
  }
  assert.deepEqual(types('minimal'), ['hero', 'product-grid', 'cta'])
  assert.equal(themePreset('spotlight', 'S').home.sections[0].settings.spotlight, true)
  assert.notDeepEqual(types('catalogue'), types('spotlight'))
})
