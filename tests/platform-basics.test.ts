import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { shopSitemap } from '@/lib/seo'
import { errorFingerprint, isNoise, pageKind, safeMessage } from '@/lib/errors/rules'

test('the sitemap lists one shop’s public pages and nothing else', () => {
  const map = shopSitemap('https://alistore.pk', { products: [{ slug: 'sidr-honey', updatedAt: new Date('2026-11-01') }, { slug: 'Bad Slug' }, { slug: '../admin' }], collections: ['eid', 'x/y'], policies: ['returns'] })
  assert.deepEqual(map.map((e) => e.url), ['https://alistore.pk/', 'https://alistore.pk/shop', 'https://alistore.pk/about', 'https://alistore.pk/contact', 'https://alistore.pk/collections/eid', 'https://alistore.pk/product/sidr-honey', 'https://alistore.pk/policies/returns'])
  assert.deepEqual(map.find((e) => e.url.endsWith('/sidr-honey'))!.lastModified, new Date('2026-11-01'))
  for (const e of map) assert.doesNotMatch(e.url, /admin|checkout|track|api/)
  const src = readFileSync('app/sitemap.ts', 'utf8')
  assert.match(src, /where: \{ storeId: store\.id, status: 'ACTIVE' \}/, 'only live products of this store')
  assert.match(src, /store\.approval !== 'APPROVED'/, 'a shop that is not open lists nothing')
  const robots = readFileSync('app/robots.ts', 'utf8')
  for (const p of ['/admin', '/csmi', '/api/', '/checkout', '/track']) assert.ok(robots.includes(`'${p}'`), p)
})

test('a crash is recorded safely: grouped by kind of page, with nothing private in it', () => {
  assert.equal(pageKind('/product/sidr-honey-500g?x=1'), '/product/[…]')
  assert.equal(pageKind('/admin/orders/cmw6abc123'), '/admin/orders/[…]')
  assert.equal(pageKind('/admin/orders/slips'), '/admin/orders/slips'); assert.equal(pageKind('/'), '/'); assert.equal(pageKind(null), '/'); assert.equal(pageKind('shop'), '/')
  assert.equal(pageKind('/track?code=MP-1234'), '/track', 'a tracking code never reaches the error list')
  const m = safeMessage(`Failed for ali@example.com at https://api.x.com/v1?key=abc phone 0300-1234567 token ${'Ab1'.repeat(14)}\n\tend`)
  assert.equal(m, 'Failed for [email] at [address] phone [phone] token [key] end')
  assert.equal(safeMessage(''), 'Unknown error'); assert.ok(safeMessage('word '.repeat(200)).length <= 300)
  assert.equal(errorFingerprint('server', '/shop', 'boom'), errorFingerprint('server', '/shop', 'boom')); assert.notEqual(errorFingerprint('server', '/shop', 'boom'), errorFingerprint('client', '/shop', 'boom'))
  assert.equal(isNoise('NEXT_NOT_FOUND'), true); assert.equal(isNoise('x', 'NEXT_REDIRECT;replace;/shop'), true); assert.equal(isNoise('Cannot read properties of undefined'), false)
  const rec = readFileSync('lib/errors/record.ts', 'utf8')
  assert.match(rec, /rateLimit\('error-events', 120, 60_000\)/); assert.match(rec, /update: \{ count: \{ increment: 1 \}/); assert.match(rec, /\} catch \(err\)/)
  assert.match(readFileSync('app/csmi/(panel)/errors/page.tsx', 'utf8'), /await requirePlatform\(\)/, 'only the platform owner sees the list')
  assert.match(readFileSync('instrumentation.ts', 'utf8'), /export async function onRequestError/)
})

test('the safety net is in place: checks on every push, hardened headers, friendly error pages', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
  for (const step of ['prisma validate', 'tsc --noEmit', 'pnpm test']) assert.ok(ci.includes(step), step)
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')).scripts
  assert.equal(pkg['db:migrate'], 'prisma migrate deploy'); assert.match(pkg.check, /prisma validate && tsc --noEmit/)
  const cfg = readFileSync('next.config.ts', 'utf8')
  assert.match(cfg, /Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"/)
  assert.match(cfg, /NODE_ENV === 'production' \? \[\{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' \}\]/)
  for (const f of ['app/(shop)/not-found.tsx', 'app/(shop)/error.tsx', 'app/(shop)/loading.tsx', 'app/not-found.tsx', 'docs/OPERATIONS.md']) assert.ok(existsSync(f), f)
  assert.doesNotMatch(readFileSync('app/(shop)/error.tsx', 'utf8'), /error\.stack|\{error\.message\}/, 'the customer never sees technical detail')
})

test('sharing previews: a title, a short text and only an https picture; every shop page has one', async () => {
  const { sharePreview } = await import('@/lib/seo')
  const a = sharePreview({ siteName: 'Ali Store', title: 'Sidr Honey', description: 'x '.repeat(300), image: 'https://res.cloudinary.com/a/b.jpg', url: 'https://ali.pk/product/honey' })
  assert.equal(a.openGraph.title, 'Sidr Honey'); assert.equal(a.openGraph.siteName, 'Ali Store'); assert.deepEqual(a.openGraph.images, ['https://res.cloudinary.com/a/b.jpg'])
  assert.ok(a.openGraph.description!.length <= 200); assert.equal(a.twitter.card, 'summary_large_image'); assert.equal(a.openGraph.url, 'https://ali.pk/product/honey')
  for (const bad of ['http://x.com/a.jpg', 'javascript:alert(1)', '/local.jpg', 'https://x.com/a b.jpg', null]) {
    const b = sharePreview({ siteName: 'S', title: 'T', image: bad })
    assert.equal('images' in b.openGraph, false, String(bad)); assert.equal(b.twitter.card, 'summary')
  }
  const { readFileSync } = await import('node:fs')
  for (const f of ['app/(shop)/layout.tsx', 'app/(shop)/product/[slug]/page.tsx', 'app/(shop)/collections/[handle]/page.tsx']) assert.match(readFileSync(f, 'utf8'), /\.\.\.sharePreview\(/, f)
})
