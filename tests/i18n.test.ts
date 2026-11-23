import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { UR, t, readLanguage, parseLanguage, isRtl, LANGUAGES } from '@/lib/i18n'

test('the language comes from the shop settings; anything unknown is English', () => {
  assert.equal(readLanguage({ language: { language: 'ur' } }), 'ur')
  for (const junk of [null, {}, { language: 'ur' }, { language: { language: 'fr' } }, { language: { language: ['ur'] } }, 'ur']) assert.equal(readLanguage(junk), 'en')
  assert.deepEqual(parseLanguage(() => 'ur'), { ok: true, value: { language: 'ur' } }); assert.equal(parseLanguage(() => 'xx').ok, false); assert.equal(parseLanguage(() => '__proto__').ok, false)
  assert.equal(isRtl('ur'), true); assert.equal(isRtl('en'), false); assert.deepEqual(Object.keys(LANGUAGES), ['en', 'ur'])
})

test('English in, Urdu out; an English shop is never changed', () => {
  assert.equal(t('en', 'Add to cart'), 'Add to cart'); assert.equal(t('ur', 'Add to cart'), 'ٹوکری میں ڈالیں')
  for (const [en, ur] of Object.entries(UR)) {
    assert.ok(ur.trim().length > 0, en)
    assert.match(ur, /[؀-ۿ]/, `"${en}" must have Urdu letters`)
    assert.doesNotMatch(ur, /[<>{}]/, `"${en}" must be plain words`)
  }
})

test('every sentence the shop asks for exists in the list (a typo cannot ship)', () => {
  const files: string[] = []
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(n)) files.push(p) } }
  walk('app/(shop)'); walk('components')
  let used = 0
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/\b(?:tr|t)\((?:ctx\.lang|lang|data\.lang), '((?:[^'\\]|\\.)*)'\)|\btr\('((?:[^'\\]|\\.)*)'\)/g)) {
    const phrase = m[1] ?? m[2]; used++
    assert.ok(phrase in UR, `${f}: "${phrase}" is not in lib/i18n.ts`)
  }
  assert.ok(used >= 40, `only ${used} uses found`)
})

test('the shop turns right to left for Urdu and tells the browser-side parts the language', () => {
  const layout = readFileSync('app/(shop)/layout.tsx', 'utf8')
  assert.match(layout, /lang=\{ctx\.lang\} dir=\{rtl \? 'rtl' : undefined\}/); assert.match(layout, /<LangProvider lang=\{ctx\.lang\}>/)
  assert.match(readFileSync('lib/storefront/data.ts', 'utf8'), /lang: readLanguage\(s\?\.extra\)/)
  assert.match(readFileSync('app/admin/(panel)/settings/actions.ts', 'utf8'), /saveExtra\(storeId, 'language', v\)/)
})
