import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'app/(shop)'
const pages: string[] = []
const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n === 'page.tsx') pages.push(d) } }
walk(ROOT)

test('every shop page has a loading skeleton of its own, not the one of another page', () => {
  assert.ok(pages.length >= 12, `only ${pages.length} pages found`)
  const seen = new Map<string, string>()
  for (const dir of pages) {
    const page = readFileSync(join(dir, 'page.tsx'), 'utf8')
    if (/^\s*redirect\(/m.test(page) && !/return\s*\(/.test(page)) continue // a page that only forwards elsewhere shows nothing
    const file = join(dir, 'loading.tsx')
    assert.ok(existsSync(file), `${dir} has no loading.tsx: it would show another page's skeleton`)
    const src = readFileSync(file, 'utf8')
    assert.match(src, /<Skeleton label="[^"]+"/, `${file} must use the shared Skeleton wrapper (screen-reader label)`)
    const body = src.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')
    assert.ok(!seen.has(body), `${file} is the same as ${seen.get(body)}`)
    seen.set(body, file)
  }
})

test('skeletons are drawn on the server: no browser JavaScript for them', () => {
  for (const f of ['components/shop/Skeletons.tsx', ...pages.map((d) => join(d, 'loading.tsx')).filter(existsSync)]) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /['"]use client['"]/, f)
  }
})
