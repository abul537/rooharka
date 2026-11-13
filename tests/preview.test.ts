import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  PREVIEW_LINK_SECONDS, PREVIEW_SESSION_SECONDS, makeLinkToken, makeSessionPass, previewLink, readLinkToken, readSessionPass, safePreviewPath, storeOrigin, visibleStatuses,
} from '@/lib/preview/rules'

const A = { storeId: 'store_AAAAAAAAAA', userId: 'user_1111111111' }
const now = 1_800_000_000_000

test('link token: names the store and the person, lasts one minute, cannot be changed or reused as a session', () => {
  const t = makeLinkToken(A, now)
  assert.deepEqual(readLinkToken(t, now + 1000), A)
  assert.deepEqual(readLinkToken(t, now + (PREVIEW_LINK_SECONDS - 1) * 1000), A)
  assert.equal(readLinkToken(t, now + PREVIEW_LINK_SECONDS * 1000 + 1), null, 'expired after a minute')
  assert.equal(readSessionPass(t, now), null, 'a link token is not a session pass')
  assert.notEqual(makeLinkToken({ ...A, storeId: 'store_BBBBBBBBBB' }, now), t, 'different for every store')
  assert.notEqual(makeLinkToken({ ...A, userId: 'user_2222222222' }, now), t, 'different for every person')
  for (const bad of [null, undefined, '', 'abc', 'a.b', 'a.b.c', `${t}x`, t.slice(0, -2) + 'AA', 'x'.repeat(2000)]) assert.equal(readLinkToken(bad, now), null, String(bad).slice(0, 20))
})

test('a forged pass is refused: changing the store inside a real token breaks the signature', () => {
  const t = makeSessionPass(A, now)
  const [body, sig] = t.split('.')
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  const forged = `${Buffer.from(JSON.stringify({ ...payload, s: 'store_BBBBBBBBBB' })).toString('base64url')}.${sig}`
  assert.equal(readSessionPass(forged, now), null)
  const longer = `${Buffer.from(JSON.stringify({ ...payload, exp: payload.exp + 999_999 })).toString('base64url')}.${sig}`
  assert.equal(readSessionPass(longer, now), null, 'the expiry cannot be extended')
})

test('session pass: one hour, only as a session, ids must look like ids', () => {
  const s = makeSessionPass(A, now)
  assert.deepEqual(readSessionPass(s, now + 59 * 60 * 1000), A)
  assert.equal(readSessionPass(s, now + PREVIEW_SESSION_SECONDS * 1000 + 1), null)
  assert.equal(readLinkToken(s, now), null, 'a session pass cannot open a new preview')
  assert.equal(readSessionPass(makeSessionPass({ storeId: '../x', userId: 'u1' }, now), now), null)
})

test('landing page: only a page of the same shop; anything else becomes the home page', () => {
  for (const ok of ['/', '/shop', '/product/rose-water', '/shop?category=oils&page=2', '/collections/eid-2026', '/policies/returns#top']) assert.equal(safePreviewPath(ok), ok)
  for (const bad of [null, '', 'shop', '//evil.com', '//evil.com/shop', 'https://evil.com', '/\\evil.com', '/shop\\..\\admin', '/x?next=https://evil.com', 'javascript:alert(1)', '/admin', '/admin/orders', '/ADMIN/orders', '/api/orders', '/csmi', '/_next/x', '/shop/../admin', '/shop/..', '/a\nb', '/' + 'x'.repeat(400)]) {
    assert.equal(safePreviewPath(bad), '/', String(bad).slice(0, 30))
  }
})

test('statuses: customers see live products only; a preview adds drafts; archived never', () => {
  assert.deepEqual(visibleStatuses(false), ['ACTIVE'])
  assert.deepEqual(visibleStatuses(true), ['ACTIVE', 'DRAFT'])
  assert.ok(!(visibleStatuses(true) as string[]).includes('ARCHIVED'))
})

test('preview address: the shop own address, with the token and the page safely encoded', () => {
  assert.equal(previewLink('https://ali.rooharka.pk/', '/product/a b', 'tok.en'), 'https://ali.rooharka.pk/api/preview?secret=tok.en&slug=%2Fproduct%2Fa%20b')
  assert.equal(previewLink('https://x.pk', '//evil.com', 't'), 'https://x.pk/api/preview?secret=t&slug=%2F')
  assert.equal(storeOrigin({ domains: [{ host: 'a.pk', isPrimary: false }, { host: 'main.pk', isPrimary: true }], free: 'https://ali.rooharka.pk', requestHost: 'x' }), 'https://main.pk')
  assert.equal(storeOrigin({ domains: [], free: 'https://ali.rooharka.pk', requestHost: 'x' }), 'https://ali.rooharka.pk')
  assert.equal(storeOrigin({ domains: [], free: null, requestHost: 'localhost:3000' }), 'http://localhost:3000')
  assert.equal(storeOrigin({ domains: [], free: null, requestHost: 'shop.example.pk' }), 'https://shop.example.pk')
})

// ------------------------------------------------------------------ a code review that runs with the tests
const src = (f: string) => readFileSync(f, 'utf8')

test('shop pages decide what to show through the preview rule, never a hand-written status', () => {
  for (const f of ['lib/data/catalog.ts', 'lib/data/product.ts']) {
    assert.doesNotMatch(src(f), /status: 'ACTIVE'/, `${f} must use visibleStatuses()`)
    assert.match(src(f), /visibleStatuses\(/)
  }
})

test('buying stays strict: checkout, orders and the counter only ever accept LIVE products', () => {
  for (const f of ['lib/data/checkout.ts', 'lib/orders/create-order.ts', 'lib/pos/service.ts']) {
    assert.match(src(f), /status: 'ACTIVE'/, f)
    assert.doesNotMatch(src(f), /visibleStatuses|isPreviewFor/, `${f} must not know about previews`)
  }
  assert.match(src('app/api/orders/route.ts'), /isPreviewFor\(store\.id\)\) return NextResponse\.json\(\{ error: PREVIEW_NO_ORDERS \}, \{ status: 403 \}\)/)
})

test('drafts never enter the shared catalogue memory, and a preview needs draft mode AND a valid pass AND an active member', () => {
  const cat = src('lib/data/catalog.ts')
  assert.match(cat, /const loadCatalog = memoKeyed\(15_000, \(storeId: string\) => buildCatalog\(storeId, false\)\)/)
  assert.doesNotMatch(cat, /memoKeyed\([^)]*buildCatalog\(storeId, true\)/)
  const server = src('lib/preview/server.ts')
  assert.match(server, /isEnabled\) return null/); assert.match(server, /readSessionPass\(/); assert.match(server, /isActive: true/)
  assert.match(server, /\?\.storeId === storeId/, 'scoped to the store being viewed')
  const route = src('app/api/preview/route.ts')
  assert.match(route, /store\?\.id === pass\.storeId/, 'a token for one store opens nothing on another')
  assert.match(route, /redirect\(safePreviewPath\(/, 'no open redirect')
  assert.match(route, /sameSite: 'none', secure: true/, 'works inside a frame, as the brief asks')
})
