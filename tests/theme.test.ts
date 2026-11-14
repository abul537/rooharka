import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readCloudDetails, templateVideos, videoVerdict, CORE_SECTIONS, FOLD_BUDGET_BYTES, MAX_GALLERY_IMAGES, MAX_HERO_SLIDES, MAX_SECTIONS, MAX_STORY_STEPS, MAX_VIDEOS_PER_SECTION, MAX_VIDEO_SECTIONS, RATIOS, SECTIONS, SECTION_BY_TYPE, aboutFromLegacy, fieldDefault, focalCss, newBlock, newSection, pageWarnings, parseTemplate, ratioCss, readTemplate, sectionMedia, sectionSummary, templateFromLegacy } from '@/lib/theme/schema'
import { parseSubscriberEmail } from '@/lib/theme/newsletter'
import { MIN_CONTRAST, contrastWithWhite, normalizeHex, parseCustomColor, parseThemeName, readThemeSettings, shadesFromHex, themeShades, themeVariables } from '@/lib/theme/settings'
import { THEME_PRESETS, themePreset, type ThemePresetKey } from '@/lib/theme/presets'
import { PALETTES, defaultStorefront } from '@/lib/storefront/rules'
import { presetContent } from '@/lib/storefront/presets'

test('section library: every section is well described (the editor builds its forms from this)', () => {
  assert.equal(CORE_SECTIONS.length, 10, 'the library is exactly ten sections')
  assert.deepEqual(CORE_SECTIONS.map((x) => x.type), ['hero', 'product-grid', 'category-list', 'gallery', 'story', 'video', 'reviews', 'banner', 'cta', 'faq'])
  assert.deepEqual(SECTIONS.filter((x) => x.classic).map((x) => x.type), ['highlights', 'benefits', 'collection-list'], 'older sections are kept for existing shops')
  // Every one of the ten has two to four (or more) layouts to choose from.
  for (const d of CORE_SECTIONS) { const v = d.fields.find((f) => f.key === 'layout' || f.key === 'columns'); assert.ok(v && v.kind === 'select' && v.options.length >= 2, `${d.type} has layout variants`) }
  assert.equal(new Set(SECTIONS.map((s) => s.type)).size, SECTIONS.length, 'types are unique')
  for (const s of SECTIONS) {
    assert.match(s.type, /^[a-z-]+$/); assert.ok(s.name && s.description && s.max >= 1, s.type)
    for (const fields of [s.fields, s.blocks?.fields ?? []]) {
      assert.equal(new Set(fields.map((f) => f.key)).size, fields.length, `${s.type}: field keys are unique`)
      for (const f of fields) {
        assert.ok(f.label, `${s.type}.${f.key}`)
        if (f.kind === 'select') assert.ok(f.options.some((o) => o.value === f.default), `${s.type}.${f.key}: default is one of the options`)
        if (f.kind === 'ratio') assert.ok(f.default in RATIOS)
        if (f.kind === 'focal') assert.ok(fields.some((x) => x.key === f.of && x.kind === 'image'), `${s.type}.${f.key}: points at a picture field`)
        if (f.kind === 'text' || f.kind === 'textarea') assert.ok(f.max > 0 && String(fieldDefault(f)).length <= f.max)
      }
    }
    if (s.blocks) assert.ok(s.blocks.fields.some((f) => f.key === s.blocks!.titleKey) && s.blocks.max >= 1, `${s.type}: blocks`)
    // A brand new section of every type is valid as it comes.
    const fresh = newSection(s.type, 'x1')!
    const mainKind = s.blocks?.fields.find((f) => f.key === s.blocks!.titleKey)?.kind
    const main = mainKind === 'image' ? 'https://cdn.example.pk/a.jpg' : mainKind === 'video' ? 'https://cdn.example.pk/a.mp4' : 'Something'
    const withBlock = s.blocks ? { ...fresh, blocks: [{ id: 'b1', settings: { ...newBlock(s.blocks, 'b1').settings, [s.blocks.titleKey]: main } }] } : fresh
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
  assert.match(err(hero({ title: '' })), /Hero: Headline cannot be empty/)
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
  assert.deepEqual(one.sections.map((s) => s.type), ['hero', 'highlights', 'product-grid', 'story', 'benefits', 'reviews', 'faq', 'cta'])
  assert.equal(one.sections[0].settings.spotlight, true)
  assert.deepEqual([one.sections[2].settings.title, one.sections[2].settings.skipFirst, one.sections[2].settings.count], ['Also available', true, '4'])
  assert.equal(one.sections[4].blocks.length, 5); assert.equal(one.sections[3].settings.title, 'A legacy of healing')
  const off = defaultStorefront('S'); off.show.faq = false; off.show.featured = false
  const hidden = templateFromLegacy(off)
  assert.deepEqual(hidden.sections.filter((s) => s.hidden).map((s) => s.type), ['product-grid', 'faq'], 'switched-off parts stay, hidden')
  for (const t of [cat, one, hidden]) assert.deepEqual(parseTemplate(t), { ok: true, value: t }, 'a converted page can be saved unchanged')
  assert.equal(sectionSummary(cat.sections[0]), 'Hero: Welcome to Ali Store'); assert.equal(sectionSummary(cat.sections[1]), 'Highlights bar')
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
  assert.deepEqual(readThemeSettings(null), { color: 'emerald', customColor: '', font: 'sans', corners: 'soft' })
  assert.deepEqual(readThemeSettings({ color: 'neon', font: 'comic', customColor: '#ffffff', corners: 'spiky' }, { color: 'amber', customColor: '', font: 'serif', corners: 'round' }), { color: 'amber', customColor: '', font: 'serif', corners: 'round' })
  const s = readThemeSettings({ color: 'rose', customColor: '#123456', font: 'serif' })
  assert.equal(themeShades(s).c700, '#123456')
  assert.equal(themeShades({ ...s, customColor: '' }).c700, PALETTES.rose.c700)
  const v = themeVariables(s)
  assert.deepEqual(Object.keys(v), ['--c-50', '--c-100', '--c-200', '--c-600', '--c-700', '--c-800', '--heading-font', '--r-btn', '--r-box'])
  assert.notEqual(themeVariables({ ...s, corners: 'sharp' })['--r-btn'], themeVariables({ ...s, corners: 'round' })['--r-btn'])
  assert.equal(v['--heading-font'], 'var(--font-playfair)')
  assert.deepEqual(parseThemeName('  Eid   sale '), { ok: true, value: 'Eid sale' })
  for (const bad of ['', 'x', 'a'.repeat(51), '<b>hi</b>']) assert.equal(parseThemeName(bad).ok, false)
})

test('starter designs (Minimal, Editorial, Bold, Spotlight): valid Home and About pages, and really different', () => {
  assert.deepEqual(Object.keys(THEME_PRESETS), ['minimal', 'editorial', 'bold', 'spotlight'])
  const types = (k: ThemePresetKey) => themePreset(k, 'Ali Store').home.sections.map((s) => s.type)
  for (const k of Object.keys(THEME_PRESETS) as ThemePresetKey[]) {
    const p = themePreset(k, 'Ali Store')
    for (const page of [p.home, p.about]) {
      assert.deepEqual(parseTemplate(page), { ok: true, value: page }, k)
      assert.ok(page.sections.length >= 3 && page.sections[0].type === 'hero', k)
      assert.ok(page.sections.every((s) => SECTION_BY_TYPE.has(s.type)))
    }
    assert.deepEqual(readThemeSettings(p.settings), p.settings, k)
  }
  assert.deepEqual(types('minimal'), ['hero', 'product-grid', 'reviews', 'cta'])
  assert.equal(themePreset('editorial', 'S').home.sections[0].settings.layout, 'full-bleed')
  assert.equal(themePreset('bold', 'S').home.sections.find((s) => s.type === 'product-grid')!.settings.layout, 'carousel')
  assert.equal(themePreset('spotlight', 'S').home.sections[0].settings.spotlight, true)
  assert.equal(new Set((Object.keys(THEME_PRESETS) as ThemePresetKey[]).map((k) => JSON.stringify(themePreset(k, 'S').settings))).size, 4, 'four different looks')
})

test('pictures: only shape presets (never pixels) and a focal point from 0 to 100', () => {
  assert.deepEqual(Object.keys(RATIOS), ['1:1', '4:5', '16:9', '3:1', '21:9'])
  assert.equal(ratioCss('16:9'), '16 / 9'); assert.equal(ratioCss('1920x1080'), '1 / 1'); assert.equal(ratioCss(undefined), '1 / 1')
  assert.equal(focalCss('30,70'), '30% 70%'); assert.equal(focalCss(''), '50% 50%'); assert.equal(focalCss('300,5'), '50% 50%'); assert.equal(focalCss('a,b'), '50% 50%')
  const g = (settings: object, blocks: object[] = []) => readTemplate({ sections: [{ id: 'g', type: 'gallery', settings, blocks }] }).sections[0]
  assert.equal(g({ ratio: '500px' }).settings.ratio, '1:1', 'anything that is not a preset becomes the default shape')
  assert.equal(g({ ratio: '4:5' }).settings.ratio, '4:5')
  const b = g({}, [{ id: 'p', settings: { imageUrl: 'https://cdn.example.pk/a.jpg', imageFocal: '020,099', alt: 'Shop front' } }, { id: 'q', settings: { imageUrl: 'https://cdn.example.pk/b.jpg', imageFocal: '120,5' } }]).blocks
  assert.equal(b[0].settings.imageFocal, '20,99'); assert.equal(b[1].settings.imageFocal, '', 'out of range = centre')
  // No section anywhere has a width or height setting.
  for (const d of SECTIONS) for (const f of [...d.fields, ...(d.blocks?.fields ?? [])]) assert.doesNotMatch(f.key + f.label, /width|height|pixel|px\b/i, `${d.type}.${f.key}`)
})

test('the hard limits are enforced when saving, whatever the editor allowed', () => {
  const err = (raw: unknown) => { const r = parseTemplate(raw); assert.equal(r.ok, false); return r.ok ? '' : r.error }
  const img = (i: number) => ({ id: `p${i}`, settings: { imageUrl: `https://cdn.example.pk/${i}.jpg` } })
  const vid = (i: number) => ({ id: `v${i}`, settings: { videoUrl: `https://cdn.example.pk/${i}.mp4` } })
  assert.deepEqual([MAX_GALLERY_IMAGES, MAX_STORY_STEPS, MAX_HERO_SLIDES, MAX_VIDEOS_PER_SECTION, MAX_VIDEO_SECTIONS], [30, 6, 3, 2, 3])
  assert.ok(parseTemplate({ sections: [{ id: 'g', type: 'gallery', blocks: Array.from({ length: 30 }, (_, i) => img(i)) }] }).ok)
  assert.match(err({ sections: [{ id: 'g', type: 'gallery', blocks: Array.from({ length: 31 }, (_, i) => img(i)) }] }), /at most 30 pictures/)
  assert.match(err({ sections: [{ id: 'h', type: 'hero', settings: { title: 'T', layout: 'carousel' }, blocks: Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, settings: { title: 'Slide' } })) }] }), /at most 3 slides/)
  assert.match(err({ sections: [{ id: 's', type: 'story', settings: { layout: 'timeline' }, blocks: Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, settings: { title: 'Step' } })) }] }), /at most 6 timeline steps/)
  assert.match(err({ sections: [{ id: 'v', type: 'video', blocks: [vid(1), vid(2), vid(3)] }] }), /at most 2 videos/)
  assert.match(err({ sections: Array.from({ length: 4 }, (_, i) => ({ id: `v${i}`, type: 'video', blocks: [vid(i)] })) }), /at most 3 times/)
  assert.match(err({ sections: [{ id: 'v', type: 'video', blocks: [{ id: 'a', settings: { videoUrl: 'https://cdn.example.pk/film.avi' } }] }] }), /end in \.mp4 or \.webm/)
  assert.match(err({ sections: [{ id: 'g', type: 'gallery', blocks: [{ id: 'a', settings: { imageUrl: '' } }] }] }), /picture 1: add the picture, or remove this picture/)
  assert.match(err({ sections: [{ id: 'v', type: 'video', blocks: [{ id: 'a', settings: { caption: 'no file' } }] }] }), /video 1: add the video/)
  // Reading (never fails): the extra items are simply cut off.
  assert.equal(readTemplate({ sections: [{ id: 'g', type: 'gallery', blocks: Array.from({ length: 45 }, (_, i) => img(i)) }] }).sections[0].blocks.length, 30)
  assert.equal(readTemplate({ sections: Array.from({ length: 6 }, (_, i) => ({ id: `v${i}`, type: 'video', blocks: [vid(i)] })) }).sections.length, 3)
})

test('pages saved before the ten-section library still open: old section types become their new equivalent', () => {
  const t = readTemplate({ sections: [
    { id: 'a', type: 'image-text', settings: { title: 'Our story', text: 'Once', imageUrl: 'https://cdn.example.pk/s.jpg', imageSide: 'right', buttonLabel: 'More', buttonLink: '/about' } },
    { id: 'b', type: 'image-text', settings: { title: 'No picture', text: 'Words' } },
    { id: 'c', type: 'rich-text', settings: { title: 'A note', text: 'Hello', align: 'left', buttonLabel: 'Go', buttonLink: '/shop' } },
    { id: 'd', type: 'hero', settings: { title: 'Hi', layout: 'image-left' } }, { id: 'e', type: 'product-grid', settings: { title: 'P', count: '8' } },
  ] })
  assert.deepEqual(t.sections.map((s) => [s.type, s.settings.layout]), [['story', 'split'], ['story', 'centered'], ['story', 'centered'], ['hero', 'image-left'], ['product-grid', 'grid-4']])
  assert.deepEqual([t.sections[0].settings.title, t.sections[0].settings.imageSide, t.sections[0].settings.buttonLink], ['Our story', 'right', '/about'])
  assert.equal(t.sections[2].settings.text, 'Hello')
})

test('About is a template like Home, made from the shop\'s old About text', () => {
  const c = defaultStorefront('Ali Store'); c.about = { title: 'About Ali Store', body: 'We began in Lahore.\n\nToday we deliver everywhere.' }
  const a = aboutFromLegacy(c, 'Ali Store')
  assert.deepEqual(a.sections.map((s) => s.type), ['hero', 'story', 'highlights', 'cta'])
  assert.deepEqual([a.sections[0].settings.title, a.sections[0].settings.layout], ['About Ali Store', 'centered'])
  assert.match(String(a.sections[1].settings.text), /We began in Lahore/)
  assert.deepEqual(parseTemplate(a), { ok: true, value: a })
  const empty = defaultStorefront('Ali Store'); empty.trust = []
  const e = aboutFromLegacy(empty, 'Ali Store')
  assert.deepEqual(e.sections.map((s) => s.type), ['hero', 'story', 'cta'])
  assert.match(String(e.sections[1].settings.text), /Ali Store is a Pakistani online store/)
})

test('editor guard rails: a heavy top of the page, a long gallery, a video up top, unfinished layouts', () => {
  const big = 'https://cdn.example.pk/big.jpg', small = 'https://cdn.example.pk/small.jpg'
  const hero = (s: object, blocks: object[] = []) => ({ id: 'h', type: 'hero', settings: { title: 'T', ...s }, blocks })
  const warn = (sections: object[], bytes = {}) => pageWarnings(readTemplate({ sections }), bytes).map((w) => w.text).join(' | ')
  assert.equal(warn([hero({ imageUrl: small })], { [small]: 300_000 }), '')
  assert.match(warn([hero({ imageUrl: big })], { [big]: FOLD_BUDGET_BYTES + 1 }), /top of this page is heavy \(about 2\.0 MB/)
  assert.equal(warn([hero({ imageUrl: small }), { id: 's', type: 'story', settings: { imageUrl: big } }], { [small]: 1, [big]: 9_000_000 }), '', 'only the top of the page counts')
  assert.equal(warn([hero({ imageUrl: big })]), '', 'a pasted address has no known size: no made-up warning')
  const pics = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, settings: { imageUrl: `https://cdn.example.pk/${i}.jpg` } }))
  assert.match(warn([hero({}), { id: 'g', type: 'gallery', blocks: pics }]), /12 pictures\. The first 8 are shown/)
  assert.equal(warn([hero({}), { id: 'g', type: 'gallery', settings: { layout: 'carousel' }, blocks: pics }]), '')
  assert.match(warn([{ id: 'v', type: 'video', blocks: [{ id: 'a', settings: { videoUrl: 'https://cdn.example.pk/a.mp4' } }] }]), /video is the first thing/)
  assert.match(warn([hero({ layout: 'video' })]), /no video yet.*\| Add a picture to the video hero/)
  assert.match(warn([hero({ layout: 'carousel' })]), /no slides yet/)
  assert.match(warn([hero({}), { id: 's', type: 'story', settings: { layout: 'timeline' } }]), /no steps yet/)
  assert.equal(warn([{ ...hero({ layout: 'video' }), hidden: true }, hero({})].map((x, i) => ({ ...x, id: `h${i}` }))), '', 'hidden sections are not checked')
  assert.deepEqual(sectionMedia(readTemplate({ sections: [hero({ imageUrl: small, videoUrl: 'https://cdn.example.pk/v.mp4' }, [{ id: 's1', settings: { title: 'S', imageUrl: big } }])] }).sections[0]), [small, 'https://cdn.example.pk/v.mp4', big])
})

import { readFileSync } from 'node:fs'

test('every section in the library has a component that draws it, and the other way round', () => {
  const src = readFileSync('components/sections/registry.tsx', 'utf8')
  const start = src.indexOf('export const SECTION_COMPONENTS')
  const table = src.slice(src.indexOf('= {', start), src.indexOf('export function RenderSections'))
  const keys = [...table.matchAll(/(?:'([a-z-]+)'|\b([a-z]+)):\s*[A-Z]\w+/g)].map((m) => m[1] ?? m[2])
  assert.deepEqual([...keys].sort(), SECTIONS.map((s) => s.type).sort())
})

test('themes are stored and read per store, and the shop never trusts a stored template', () => {
  const data = readFileSync('lib/theme/data.ts', 'utf8')
  // Every theme query names the store; a template is looked up through a theme that was checked first.
  for (const m of data.matchAll(/db\.shopTheme\.(findFirst|findMany|count|updateMany)\(([^)]*)\)/g)) assert.match(m[2], /storeId/, m[0].slice(0, 80))
  assert.doesNotMatch(data, /db\.shopTheme\.findUnique/)
  assert.ok([...data.matchAll(/db\.shopTheme\./g)].length >= 8, 'the queries are really being reviewed')
  assert.match(data, /const parsed = parseTemplate\(raw\[type\]\)/, 'what the editor sends is checked on the server')
  assert.match(data, /readTemplate\(\{ sections: row\.sections \}\)/, 'what is stored is cleaned again when read')
  assert.match(data, /if \(t\.isActive\) throw new ThemeError/, 'the live theme cannot be deleted')
  const ctx = readFileSync('lib/storefront/data.ts', 'utf8')
  assert.match(ctx, /if \(await isPreviewFor\(store\.id\)\) \{[\s\S]*getThemeById\(store\.id, wanted/, 'a draft theme is shown only inside the owner\'s own preview, and only this store\'s')
})

// ------------------------------------------------------------------ media guard rails, newsletter, components
test('a section video must be MP4 or WebM, at most 15 seconds and 10 MB, as measured by the file host', () => {
  const MB = 1024 * 1024
  assert.deepEqual(videoVerdict({ bytes: 9 * MB, duration: 14.2, format: 'mp4' }), { ok: true })
  assert.deepEqual(videoVerdict({ bytes: 10 * MB, duration: 15.3, format: 'webm' }), { ok: true }, 'a hair over 15 s (container rounding) is allowed')
  for (const bad of [{ bytes: 9 * MB, duration: 16, format: 'mp4' }, { bytes: 10 * MB + 1, duration: 5, format: 'mp4' }, { bytes: 1 * MB, duration: 5, format: 'mov' }, { bytes: null, duration: 5, format: 'mp4' }, { bytes: MB, duration: null, format: 'mp4' }, { bytes: MB, duration: 0, format: 'mp4' }]) {
    const v = videoVerdict(bad)
    assert.equal(v.ok, false, JSON.stringify(bad)); assert.ok(!v.ok && v.error.length > 20)
  }
  // Cloudinary's description: only real positive numbers are believed; anything else is "unknown", which is refused.
  assert.deepEqual(readCloudDetails({ bytes: 123, duration: 7.5, format: 'mp4' }), { bytes: 123, duration: 7.5, format: 'mp4' })
  assert.deepEqual(readCloudDetails({ bytes: '123', video: { duration: 3 } }), { bytes: null, duration: 3, format: '' })
  assert.deepEqual(readCloudDetails(null), { bytes: null, duration: null, format: '' })
  assert.equal(videoVerdict(readCloudDetails({ bytes: 5, format: 'mp4' })).ok, false)
})

test('every video a page uses is found (hero background and video blocks), so none can skip the check', () => {
  const V1 = 'https://res.cloudinary.com/x/video/upload/v1/a.mp4', V2 = 'https://res.cloudinary.com/x/video/upload/v1/b.webm'
  const t = readTemplate({ sections: [
    { id: 'h', type: 'hero', hidden: true, settings: { title: 'T', layout: 'video', videoUrl: V1, imageUrl: 'https://x.test/a.jpg' } },
    { id: 'v', type: 'video', settings: {}, blocks: [{ id: 'b1', settings: { videoUrl: V2, posterUrl: 'https://x.test/p.jpg' } }] },
    { id: 'f', type: 'faq', settings: {}, blocks: [{ id: 'b1', settings: { q: 'Q', a: 'A' } }] },
  ] })
  assert.deepEqual(templateVideos(t), [V1, V2])
  const data = readFileSync('lib/theme/data.ts', 'utf8')
  assert.match(data, /templateVideos\(tpl\)/); assert.match(data, /kind: 'VIDEO', url: \{ in: videos \}, durationSec: \{ not: null, lte: VIDEO_MAX_SECONDS \}, sizeBytes: \{ not: null, lte: VIDEO_MAX_BYTES \}/)
  assert.ok(data.indexOf('templateVideos(tpl)') < data.indexOf('db.$transaction(['), 'checked before anything is stored')
})

test('the media library and the newsletter list never leave their store', () => {
  const media = readFileSync('lib/theme/media.ts', 'utf8')
  const queries = [...media.matchAll(/db\.mediaAsset\.(findMany|findFirst|updateMany|create)\(\{ (where|data): \{([^}]*)/g)]
  assert.ok(queries.length >= 5)
  for (const q of queries) assert.match(q[3], /storeId/, q[0])
  assert.match(media, /verifyUpload\(report, c, storeId\)/, 'an upload is proven to be this store’s before it is saved')
  assert.match(media, /if \(!verdict\.ok\) \{ await remove\(\)/, 'a refused upload is deleted, not left behind')
  const actions = readFileSync('app/admin/(panel)/storefront/media-actions.ts', 'utf8')
  assert.equal([...actions.matchAll(/export async function/g)].length, [...actions.matchAll(/await adminOrError\('settings\.edit'\)/g)].length, 'every media action checks the admin first')
  const route = readFileSync('app/api/newsletter/route.ts', 'utf8')
  assert.match(route, /rateLimit\(/); assert.match(route, /storeId_email: \{ storeId: store\.id, email \}/)
  assert.match(readFileSync('app/admin/(panel)/messages/subscribers/page.tsx', 'utf8'), /requireAdmin\('orders\.view'\)[\s\S]*where: \{ storeId: admin\.storeId \}/)
  assert.equal(parseSubscriberEmail('  Ali@Example.COM '), 'ali@example.com')
  for (const bad of ['', 'ali', 'ali@', 'a b@c.com', 'a@b', 'a@b..com', '<a@b.com>', 'a@b.com,c@d.com', 5, null, `${'a'.repeat(250)}@b.com`]) assert.equal(parseSubscriberEmail(bad), null, String(bad))
})

test('the section components keep the performance promises', () => {
  const src = readFileSync('components/sections/registry.tsx', 'utf8')
  assert.equal([...src.matchAll(/\bautoPlay\b/g)].length, 1, 'exactly one video may start by itself: the hero background')
  const auto = src.slice(src.indexOf('autoPlay') - 200, src.indexOf('autoPlay') + 400)
  assert.match(auto, /muted/); assert.match(auto, /preload="metadata"/); assert.match(auto, /hidden[^"]*md:block/); assert.match(auto, /media="\(min-width: 768px\)"/, 'phones never download the hero video')
  assert.match(src, /<video controls playsInline preload="none"/, 'showcase videos download nothing until play is pressed')
  assert.doesNotMatch(src, /dangerouslySetInnerHTML/)
  // `width={1600}` on a picture only chooses which resized copy Cloudinary sends; it never sizes anything on the page.
  assert.doesNotMatch(src, /\bheight=\{?\d|style=\{\{[^}]*\b(width|height):\s*['"]?\d/, 'shapes come from ratio presets, not pixel sizes')
  assert.ok([...src.matchAll(/aspectRatio: ratioCss\(/g)].length >= 4)
  assert.match(src, /pics\.slice\(0, GALLERY_FOLD\)/)
  // Home and About are both drawn by the same engine; About has no page code of its own.
  for (const page of ['app/(shop)/page.tsx', 'app/(shop)/about/page.tsx']) assert.match(readFileSync(page, 'utf8'), /<RenderSections sections=\{sections\}/)
  assert.match(readFileSync('app/(shop)/about/page.tsx', 'utf8'), /pages\.about/)
})
