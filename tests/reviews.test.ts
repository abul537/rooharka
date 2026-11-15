import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseReview } from '@/lib/reviews'

const good = { productSlug: 'sidr-honey', authorName: ' Ali  Khan ', city: 'Lahore', rating: 5, body: 'Very pure honey,\narrived in two days.', trackingCode: 'mp-7k4q-9xmd' }

test('a review is checked: a real name, 1 to 5 stars, real words, no links', () => {
  assert.deepEqual(parseReview(good), { ok: true, value: { productSlug: 'sidr-honey', authorName: 'Ali Khan', city: 'Lahore', rating: 5, body: 'Very pure honey, arrived in two days.', trackingCode: 'MP-7K4Q-9XMD' } })
  const bad = (o: object, why: RegExp) => { const r = parseReview({ ...good, ...o }); assert.ok(!r.ok && why.test(r.error), JSON.stringify(o)) }
  bad({ authorName: 'A' }, /your name/); bad({ authorName: 'visit www.spam.pk' }, /your name/); bad({ authorName: '<b>x</b>' }, /your name/)
  for (const rating of [0, 6, 4.5, '5', null]) bad({ rating }, /1 to 5 stars/)
  bad({ body: 'ok' }, /at least 10/); bad({ body: 'Great stuff, buy at https://spam.example now' }, /web addresses/); bad({ body: 'see www.spam.pk for more of this' }, /web addresses/)
  bad({ productSlug: '../admin' }, /reload/)
  const r = parseReview({ ...good, city: '<script>', trackingCode: 'x y' }); assert.ok(r.ok && r.value.city === null && r.value.trackingCode === null, 'optional fields that look wrong are dropped, not refused')
  assert.equal(parseReview({ ...good, body: 'x'.repeat(5000) }).ok && (parseReview({ ...good, body: 'x'.repeat(5000) }) as { value: { body: string } }).value.body.length, 1000)
  assert.deepEqual(parseReview({ ...good, website: 'http://bot' }), { ok: false, error: 'robot' }, 'the hidden box catches robots')
  assert.equal(parseReview(null).ok, false)
})

test('reviews stay in their store, wait for approval, and "verified" is decided by the server', () => {
  const api = readFileSync('app/api/reviews/route.ts', 'utf8')
  assert.match(api, /where: \{ storeId: store\.id, slug: r\.productSlug, status: 'ACTIVE' \}/)
  assert.match(api, /where: \{ storeId: store\.id, trackingCode: r\.trackingCode, status: 'DELIVERED', items: \{ some: \{ productId: product\.id \} \} \}/)
  assert.match(api, /isApproved: false, isVerified: !!order/); assert.doesNotMatch(api, /isVerified: r\.|isApproved: true/)
  assert.match(api, /rateLimit\(`review:\$\{clientIp\(request\.headers\)\}`, 3, 3_600_000\)/)
  assert.match(api, /parsed\.error === 'robot' \? json\(200, THANKS\)/, 'a robot is told all went well and nothing is saved')
  const actions = readFileSync('app/admin/(panel)/reviews/actions.ts', 'utf8')
  assert.match(actions, /adminOrError\('products\.edit'\)/)
  assert.match(actions, /where: \{ id, product: \{ storeId: g\.admin\.storeId \} \}/); assert.match(actions, /const scope = \{ id: r\.id, product: \{ storeId: g\.admin\.storeId \} \}/)
  assert.match(readFileSync('app/admin/(panel)/reviews/page.tsx', 'utf8'), /const mine = \{ product: \{ storeId: admin\.storeId \} \}/)
  // The shop only ever shows approved reviews.
  assert.match(readFileSync('lib/data/product.ts', 'utf8'), /isApproved: true/); assert.match(readFileSync('lib/storefront/reviews.ts', 'utf8'), /isApproved: true/)
})
