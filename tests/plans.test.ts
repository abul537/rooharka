import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PRO_FEATURE_KEYS, RECOMMENDED_PLANS, resolveFeatures, readOverrides, productLimitProblem, lockedMessage, isProFeature } from '../lib/plans/catalog.ts'
import { describePlan, yearlySaving } from '../lib/signup/plans.ts'

const basic = RECOMMENDED_PLANS[0], pro = RECOMMENDED_PLANS[1]
const on = (a: ReturnType<typeof resolveFeatures>) => [...a.on].sort()

test('Basic and Pro: Pro has every Pro feature, Basic none; prices make sense; yearly = two months free', () => {
  assert.deepEqual([basic.name, pro.name], ['Basic', 'Pro'])
  assert.deepEqual(basic.features, []); assert.deepEqual([...pro.features].sort(), [...PRO_FEATURE_KEYS].sort())
  assert.ok(pro.monthlyPrice > basic.monthlyPrice)
  for (const p of RECOMMENDED_PLANS) { assert.equal(p.yearlyPrice, p.monthlyPrice * 10); assert.equal(yearlySaving(p.monthlyPrice, p.yearlyPrice), 17) }
  assert.equal(basic.limits.products, 100); assert.equal(pro.limits.products, undefined, 'Pro: unlimited products')
  assert.ok(pro.limits.staff > basic.limits.staff); assert.ok(pro.limits.videoMb > basic.limits.videoMb)
  assert.equal(pro.limits.popular, true)
  const d = describePlan({ limits: pro.limits, features: pro.features })
  assert.ok(d.bullets.includes('Unlimited products')); assert.ok(d.bullets.includes('Automatic fake-order check')); assert.ok(d.bullets.includes('Unlimited orders'))
  assert.ok(describePlan({ limits: basic.limits, features: [] }).bullets.includes('Up to 100 products'))
})

test('the plan decides; the trial opens everything; a store with no plan keeps everything it had', () => {
  assert.deepEqual(on(resolveFeatures({ planFeatures: [], subscriptionStatus: 'ACTIVE', overrides: {} })), [])
  assert.deepEqual(on(resolveFeatures({ planFeatures: ['discounts', 'pixels', 'nonsense', 5], subscriptionStatus: 'ACTIVE', overrides: null })), ['discounts', 'pixels'])
  const trial = resolveFeatures({ planFeatures: [], subscriptionStatus: 'TRIALING', overrides: {} })
  assert.equal(trial.on.size, PRO_FEATURE_KEYS.length); assert.equal(trial.trial, true); assert.equal(trial.source.discounts, 'trial')
  assert.equal(resolveFeatures({ planFeatures: ['discounts'], subscriptionStatus: 'TRIALING', overrides: {} }).source.discounts, 'plan')
  const legacy = resolveFeatures({ planFeatures: null, subscriptionStatus: null, overrides: {} })
  assert.equal(legacy.on.size, PRO_FEATURE_KEYS.length); assert.equal(legacy.source.pos, 'no-plan')
  for (const s of ['PAST_DUE', 'CANCELLED']) assert.equal(resolveFeatures({ planFeatures: [], subscriptionStatus: s, overrides: {} }).on.size, 0, s)
})

test('the platform owner’s switch on a store always wins, both ways; the old POS switch still counts', () => {
  const a = resolveFeatures({ planFeatures: ['pixels'], subscriptionStatus: 'ACTIVE', overrides: { discounts: 'on', pixels: 'off', returns: 'maybe', hack: 'on' } })
  assert.deepEqual(on(a), ['discounts']); assert.equal(a.source.discounts, 'store'); assert.equal(a.source.pixels, 'store')
  assert.equal(resolveFeatures({ planFeatures: [], subscriptionStatus: 'TRIALING', overrides: { pixels: 'off' } }).on.has('pixels'), false, 'off wins over the trial')
  assert.equal(resolveFeatures({ planFeatures: [], subscriptionStatus: 'ACTIVE', overrides: {}, posMode: 'ON' }).on.has('pos'), true)
  assert.equal(resolveFeatures({ planFeatures: ['pos'], subscriptionStatus: 'ACTIVE', overrides: {}, posMode: 'OFF' }).on.has('pos'), false)
  assert.deepEqual(readOverrides(['on']), {}); assert.deepEqual(readOverrides({ __proto__: 'on', toString: 'on', pos: 'on' }), { pos: 'on' })
  assert.equal(isProFeature('constructor'), false)
})

test('the product limit: room, the last ones, and full, in plain words', () => {
  assert.equal(productLimitProblem(99, 1, 100), null); assert.equal(productLimitProblem(5000, 10, null), null)
  assert.match(productLimitProblem(100, 1, 100)!, /up to 100 products and all are in use\. Upgrade to Pro/)
  assert.match(productLimitProblem(97, 5, 100)!, /only 3 more can be added/)
  assert.match(lockedMessage('discounts'), /^“Discount codes” is part of the Pro plan/)
})

import { readFileSync } from 'node:fs'
import { parseOverrides, compareRows, paysForItself, SWITCHABLE, INCLUDED_IN_ALL } from '../lib/plans/catalog.ts'

test('CSMI per-store switches: follow / on / off per feature; anything else is refused', () => {
  const f = (o: Record<string, string>) => (k: string) => o[k]
  assert.deepEqual(parseOverrides(f({})), { ok: true, value: {} })
  assert.deepEqual(parseOverrides(f({ feat_discounts: 'on', feat_pixels: 'off', feat_returns: '' })), { ok: true, value: { discounts: 'on', pixels: 'off' } })
  assert.equal(parseOverrides(f({ feat_discounts: 'yes' })).ok, false)
  assert.ok(!SWITCHABLE.includes('pos'), 'POS keeps its own switch on the same form')
})

test('compare table: sizes, every-plan rows all ticked, Pro rows follow each plan', () => {
  const g = compareRows([{ limits: RECOMMENDED_PLANS[0].limits, features: [] }, { limits: RECOMMENDED_PLANS[1].limits, features: [...RECOMMENDED_PLANS[1].features] }])
  assert.deepEqual(g.map((x) => x.title), ['Size', 'Included in every plan', 'Grow and protect your sales'])
  assert.deepEqual(g[0].rows.map((r) => [r.label, ...r.values]), [['Products', 'Up to 100', 'Unlimited'], ['Orders', 'Unlimited', 'Unlimited'], ['Commission on sales', 'None', 'None'], ['Staff logins (besides you)', '1', '5'], ['Product video size', '20 MB', '50 MB']])
  assert.ok(g[1].rows.every((r) => r.values.every((v) => v === true))); assert.equal(g[1].rows.length, INCLUDED_IN_ALL.length - 1)
  assert.ok(g[2].rows.every((r) => r.values[0] === false && r.values[1] === true)); assert.equal(g[2].rows.length, PRO_FEATURE_KEYS.length)
})

test('"Pro pays for itself" is computed from the real prices', () => {
  assert.match(paysForItself(2999, 6999)!, /Rs\. 4,000 a month more than Basic.*about 12 fake orders a month/)
  assert.equal(paysForItself(5000, 5000), null)
})

// Every Pro feature is refused ON THE SERVER, not only hidden in the dashboard. This test keeps each check in place.
test('code review: each Pro feature is checked on the server where it acts', () => {
  const has = (file: string, re: RegExp) => assert.match(readFileSync(file, 'utf8'), re, `${file} lost its plan check`)
  has('lib/fraud/verify.ts', /if \(!\(await hasFeature\(storeId, 'fraud-check'\)\)\) return null/)
  has('app/api/checkout/lead/route.ts', /hasFeature\(store\.id, 'abandoned'\)/)
  has('app/admin/(panel)/abandoned/actions.ts', /featureProblem\(g\.admin\.storeId, 'abandoned'\)/)
  has('app/api/discount/route.ts', /hasFeature\(store\.id, 'discounts'\)/)
  has('lib/orders/create-order.ts', /hasFeature\(storeId, 'discounts'\)/)
  assert.equal((readFileSync('app/admin/(panel)/discounts/actions.ts', 'utf8').match(/featureProblem\(g\.admin\.storeId, 'discounts'\)/g) ?? []).length, 2)
  has('lib/storefront/data.ts', /hasFeature\(storeId, 'pixels'\)\) \? readPixels\(s\?\.extra\) : readPixels\(null\)/)
  has('lib/notify/send.ts', /hasFeature\(storeId, 'sms-updates'\)/)
  has('lib/couriers/booking.ts', /hasFeature\(storeId, 'auto-booking'\)/)
  has('lib/returns-data.ts', /hasFeature\(storeId, 'returns'\)/); has('lib/returns-data.ts', /featureProblem\(admin\.storeId, 'returns'\)/)
  has('lib/data/tracking.ts', /hasFeature\(storeId, 'returns'\)/)
  has('lib/entitlements/service.ts', /a\.has\('pos'\)/); has('lib/pos/service.ts', /loadPosAccess/)
  has('app/admin/(panel)/products/ai-actions.ts', /featureProblem\(g\.admin\.storeId, 'ai-writer'\)/)
  has('app/admin/(panel)/products/import/actions.ts', /featureProblem\(g\.admin\.storeId, 'product-import'\)/)
  has('app/admin/(panel)/products/[id]/actions.ts', /featureProblem\(admin\.storeId, 'product-designs'\)/)
  has('app/(shop)/product/[slug]/page.tsx', /hasFeature\(store\.id, 'product-designs'\)\) \? product\.pageDesign : null/)
  has('lib/csmi/manage.ts', /hasFeature\(storeId, 'custom-domain'\)/)
  has('app/csmi/(panel)/support/page.tsx', /hasFeature\(id, 'priority-support'\)/)
  // The product limit, on all three ways a product is made.
  assert.equal((readFileSync('lib/admin/products.ts', 'utf8').match(/productRoomProblem\(admin\.storeId, 1\)/g) ?? []).length, 2)
  has('lib/admin/product-import-run.ts', /productRoomProblem\(storeId, plan\.creates\.length\)/)
  // Every key used in a check really exists (a typo would silently lock a feature for everyone).
  for (const f of ['lib/fraud/verify.ts', 'lib/notify/send.ts', 'lib/couriers/booking.ts', 'lib/returns-data.ts', 'lib/data/tracking.ts', 'lib/storefront/data.ts', 'lib/csmi/manage.ts', 'app/api/discount/route.ts', 'app/api/checkout/lead/route.ts', 'lib/orders/create-order.ts', 'app/(shop)/product/[slug]/page.tsx', 'app/admin/(panel)/layout.tsx', 'app/admin/(panel)/settings/page.tsx'])
    for (const m of readFileSync(f, 'utf8').matchAll(/(?:hasFeature\([^,]+, |featureProblem\([^,]+, |\.has\(|feature=)['"]([a-z-]+)['"]/g)) assert.ok(isProFeature(m[1]), `${f}: unknown feature "${m[1]}"`)
})

test('code review: the store cannot change its own plan; requests go to the platform owner', () => {
  const act = readFileSync('app/admin/(panel)/billing/actions.ts', 'utf8')
  assert.doesNotMatch(act, /subscription\.(update|upsert|create)/); assert.match(act, /supportTicket\.create/); assert.match(act, /isActive: true, isPublic: true/)
  assert.match(readFileSync('prisma/schema.prisma', 'utf8'), /featureOverrides Json\s+@default\("\{\}"\)/)
})
