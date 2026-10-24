import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addPeriod, allocateCosts, canPlatform, csvCell, effectiveInvoiceStatus, healthFlags, intervalOf, invoiceLines, invoiceTotals, isPlatformRole,
  isValidSlug, monthlyEquivalent, nextInvoiceNumber, periodPrice, profitOf, revenueBucket, storeMonthly, toCsv, totalRevenue,
  type HealthInput, type RevenueInput,
} from '@/lib/csmi/rules'

const d = (s: string) => new Date(s)
const rev = (p: Partial<RevenueInput> = {}): RevenueInput => ({ storeStatus: 'ACTIVE', subStatus: 'ACTIVE', price: 3000, interval: 'MONTHLY', addOnMonthly: 0, ...p })

// ------------------------------------------------------------------ pricing
test('interval is read from the period length', () => {
  assert.equal(intervalOf(d('2026-01-01'), d('2026-02-01')), 'MONTHLY')
  assert.equal(intervalOf(d('2026-01-01'), d('2027-01-01')), 'YEARLY')
})

test('period price: negotiated price wins, yearly falls back to 12 months', () => {
  const plan = { monthlyPrice: 3000, yearlyPrice: 30000 }
  assert.equal(periodPrice(plan, 'MONTHLY', null), 3000)
  assert.equal(periodPrice(plan, 'YEARLY', null), 30000)
  assert.equal(periodPrice(plan, 'MONTHLY', 2000), 2000)
  assert.equal(periodPrice(plan, 'MONTHLY', 0), 0) // a free deal is a real price
  assert.equal(periodPrice({ monthlyPrice: 3000, yearlyPrice: null }, 'YEARLY', null), 36000)
})

test('yearly counts as one twelfth per month', () => assert.equal(monthlyEquivalent(30000, 'YEARLY'), 2500))

// ------------------------------------------------------------------ revenue
test('only ACTIVE store with ACTIVE subscription is MRR', () => {
  assert.equal(revenueBucket(rev()), 'MRR')
  assert.equal(revenueBucket(rev({ subStatus: 'TRIALING', storeStatus: 'TRIAL' })), 'TRIAL')
  assert.equal(revenueBucket(rev({ subStatus: 'PAST_DUE', storeStatus: 'PAST_DUE' })), 'AT_RISK')
  assert.equal(revenueBucket(rev({ storeStatus: 'SUSPENDED' })), 'NONE')
  assert.equal(revenueBucket(rev({ storeStatus: 'CANCELLED' })), 'NONE')
  assert.equal(revenueBucket(rev({ subStatus: 'CANCELLED' })), 'NONE')
  assert.equal(revenueBucket(rev({ subStatus: null, price: null })), 'NONE')
})

test('totals: buckets stay separate, yearly is /12, add-ons only for MRR stores, ARR = 12 x MRR', () => {
  const t = totalRevenue([
    rev({ price: 3000, addOnMonthly: 500 }),                                   // 3500 MRR
    rev({ price: 30000, interval: 'YEARLY' }),                                  // 2500 MRR
    rev({ subStatus: 'TRIALING', storeStatus: 'TRIAL', price: 3000 }),          // trial
    rev({ subStatus: 'PAST_DUE', storeStatus: 'PAST_DUE', price: 1000, addOnMonthly: 200 }), // at risk 1200
    rev({ storeStatus: 'SUSPENDED', price: 9999 }),                             // nothing
  ])
  assert.deepEqual(t, { mrr: 6000, arr: 72000, atRisk: 1200, trial: 3000, payingStores: 2 })
})

test('totals of nothing is zero, and rounding is to paisa', () => {
  assert.deepEqual(totalRevenue([]), { mrr: 0, arr: 0, atRisk: 0, trial: 0, payingStores: 0 })
  assert.equal(storeMonthly(rev({ price: 1000, interval: 'YEARLY' })), 83.33)
})

// -------------------------------------------------------------------- costs
test('costs: own cost hits its store, shared cost is split equally', () => {
  const r = allocateCosts([
    { id: 'a', monthlyAmount: 3000, storeId: null, isActive: true },   // shared
    { id: 'b', monthlyAmount: 500, storeId: 's1', isActive: true },    // s1 only
  ], ['s1', 's2', 's3'])
  assert.equal(r.perStore.get('s1'), 1500)
  assert.equal(r.perStore.get('s2'), 1000)
  assert.equal(r.perStore.get('s3'), 1000)
  assert.equal(r.total, 3500)
  assert.equal(r.shared, 3000)
  assert.equal(r.unallocated, 0)
})

test('costs: inactive and zero costs are ignored; shared cost with no live store is reported, not lost', () => {
  const r = allocateCosts([
    { id: 'a', monthlyAmount: 1000, storeId: null, isActive: false },
    { id: 'b', monthlyAmount: 0, storeId: null, isActive: true },
    { id: 'c', monthlyAmount: 700, storeId: null, isActive: true },
  ], [])
  assert.equal(r.total, 700)
  assert.equal(r.unallocated, 700)
  assert.equal(r.perStore.size, 0)
})

test('costs: a store-specific cost still counts for a store that is no longer live', () => {
  const r = allocateCosts([{ id: 'a', monthlyAmount: 400, storeId: 'gone', isActive: true }], ['s1'])
  assert.equal(r.perStore.get('gone'), 400)
  assert.equal(r.total, 400)
})

test('costs: shares add back up (no paisa lost to rounding for equal splits)', () => {
  const r = allocateCosts([{ id: 'a', monthlyAmount: 3000, storeId: null, isActive: true }], ['s1', 's2', 's3', 's4'])
  assert.equal([...r.perStore.values()].reduce((a, b) => a + b, 0), 3000)
})

test('profit and margin', () => {
  assert.deepEqual(profitOf(10000, 4000), { revenue: 10000, cost: 4000, profit: 6000, marginPct: 60 })
  assert.equal(profitOf(0, 500).marginPct, null)
  assert.equal(profitOf(1000, 1500).profit, -500)
})

// ------------------------------------------------------------------- health
const healthy: HealthInput = {
  storeStatus: 'ACTIVE', hasSubscription: true, overdueInvoices: 0, integrationErrors: 0, openTickets: 0,
  ordersInWindow: 40, daysSinceLastOrder: 1, storeAgeDays: 90, cancelledOrReturned: 4,
}

test('a healthy store raises nothing', () => assert.deepEqual(healthFlags(healthy), []))

test('critical flags come first', () => {
  const f = healthFlags({ ...healthy, openTickets: 2, overdueInvoices: 1, integrationErrors: 1 })
  assert.deepEqual(f.map((x) => x.level), ['critical', 'critical', 'warning'])
  assert.match(f[0].text, /overdue/)
})

test('quiet and never-ordered stores are churn risks, new stores are not', () => {
  assert.match(healthFlags({ ...healthy, daysSinceLastOrder: 20, ordersInWindow: 0 })[0].text, /20 days/)
  assert.match(healthFlags({ ...healthy, daysSinceLastOrder: null, ordersInWindow: 0 })[0].text, /No orders yet/)
  assert.deepEqual(healthFlags({ ...healthy, daysSinceLastOrder: null, ordersInWindow: 0, storeAgeDays: 5 }), [])
  assert.deepEqual(healthFlags({ ...healthy, daysSinceLastOrder: 14 }), []) // exactly at the limit is fine
})

test('high cancel/return rate needs enough orders to mean something', () => {
  assert.equal(healthFlags({ ...healthy, ordersInWindow: 10, cancelledOrReturned: 4 }).length, 1)
  assert.equal(healthFlags({ ...healthy, ordersInWindow: 3, cancelledOrReturned: 3 }).length, 0)
  assert.equal(healthFlags({ ...healthy, ordersInWindow: 10, cancelledOrReturned: 3 }).length, 0) // exactly 30%
})

test('active store without a subscription is flagged; suspended stores are quiet', () => {
  assert.match(healthFlags({ ...healthy, hasSubscription: false })[0].text, /No subscription/)
  assert.deepEqual(healthFlags({ ...healthy, storeStatus: 'SUSPENDED', overdueInvoices: 3, integrationErrors: 2 }), [])
})

// ----------------------------------------------------------------- invoices
test('invoice numbers continue from the highest of that year', () => {
  assert.equal(nextInvoiceNumber([], 2026), 'INV-2026-0001')
  assert.equal(nextInvoiceNumber(['INV-2026-0001', 'INV-2026-0009', 'INV-2025-0500', 'garbage', 'INV-2026-x'], 2026), 'INV-2026-0010')
  assert.equal(nextInvoiceNumber(['INV-2026-0009'], 2027), 'INV-2027-0001')
})

test('addPeriod clamps to month end and handles years', () => {
  assert.equal(addPeriod(d('2026-01-31T00:00:00Z'), 'MONTHLY').toISOString(), '2026-02-28T00:00:00.000Z')
  assert.equal(addPeriod(d('2028-01-31T00:00:00Z'), 'MONTHLY').toISOString(), '2028-02-29T00:00:00.000Z')
  assert.equal(addPeriod(d('2026-12-15T00:00:00Z'), 'MONTHLY').toISOString(), '2027-01-15T00:00:00.000Z')
  assert.equal(addPeriod(d('2028-02-29T00:00:00Z'), 'YEARLY').toISOString(), '2029-02-28T00:00:00.000Z')
})

test('invoice lines and totals', () => {
  const lines = invoiceLines('Growth', 3000, 'MONTHLY', [{ name: 'Tracking', monthlyFee: 250 }, { name: 'Free', monthlyFee: 0 }])
  assert.equal(lines.length, 2)
  assert.deepEqual(invoiceTotals(lines), { subtotal: 3250, tax: 0, total: 3250 })
  assert.deepEqual(invoiceTotals(lines, 16), { subtotal: 3250, tax: 520, total: 3770 })
  assert.equal(invoiceLines('Pro', 30000, 'YEARLY', [{ name: 'OTP', monthlyFee: 100 }])[1].amount, 1200)
  assert.equal(invoiceTotals([], -5).total, 0)
})

test('an unpaid invoice past its due date is overdue', () => {
  const now = d('2026-10-20')
  assert.equal(effectiveInvoiceStatus('OPEN', d('2026-10-10'), now), 'OVERDUE')
  assert.equal(effectiveInvoiceStatus('OPEN', d('2026-10-25'), now), 'OPEN')
  assert.equal(effectiveInvoiceStatus('PAID', d('2026-10-10'), now), 'PAID')
  assert.equal(effectiveInvoiceStatus('VOID', d('2026-10-10'), now), 'VOID')
})

// ---------------------------------------------------------------------- csv
test('csv: quoting and formula-injection guard', () => {
  assert.equal(csvCell('plain'), 'plain')
  assert.equal(csvCell('a,b'), '"a,b"')
  assert.equal(csvCell('say "hi"'), '"say ""hi"""')
  assert.equal(csvCell('=HYPERLINK("http://evil")'), `"'=HYPERLINK(""http://evil"")"`)
  assert.equal(csvCell('+1'), "'+1")
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)")
  assert.equal(csvCell(-5), '-5')          // real negative numbers stay numbers
  assert.equal(csvCell(null), '')
  assert.equal(toCsv(['a', 'b'], [[1, 'x,y']]), 'a,b\r\n1,"x,y"\r\n')
})

// ----------------------------------------------------------------- platform
test('platform permissions: owner everything, support read-only, store roles nothing', () => {
  assert.equal(canPlatform('PLATFORM_OWNER', 'csmi.manage'), true)
  assert.equal(canPlatform('PLATFORM_SUPPORT', 'csmi.view'), true)
  assert.equal(canPlatform('PLATFORM_SUPPORT', 'csmi.manage'), false)
  for (const r of ['STORE_OWNER', 'STORE_MANAGER', 'STORE_STAFF', '', 'x']) {
    assert.equal(canPlatform(r, 'csmi.view'), false, r)
    assert.equal(isPlatformRole(r), false, r)
  }
})

test('store slug rules', () => {
  for (const ok of ['mppmhk', 'my-store', 'a1b', 'store-2026']) assert.equal(isValidSlug(ok), true, ok)
  for (const bad of ['ab', '-abc', 'abc-', 'ABC', 'my store', 'a'.repeat(31), 'a_b', '../x', '']) assert.equal(isValidSlug(bad), false, bad)
})

// -------------------------------------------------------------------- forms
import { parseCost, parseMarkPaid, parseMoney, parseNewStore, parsePlan, parseServiceFee, parseStoreStatus, parseSubscription } from '@/lib/csmi/forms'
const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null })

test('money parsing: rupees with up to 2 decimals, nothing else', () => {
  assert.equal(parseMoney('3000'), 3000)
  assert.equal(parseMoney('3,000.50'), 3000.5)
  assert.equal(parseMoney(''), null)
  for (const bad of ['-5', '1e5', 'abc', '12.345', '1000000000', ' 5 5']) assert.ok(Number.isNaN(parseMoney(bad)), bad)
})

test('plan form', () => {
  const ok = parsePlan(form({ name: 'Growth', monthlyPrice: '3000', yearlyPrice: '30000', isActive: 'on' }))
  assert.deepEqual(ok.ok && ok.value, { name: 'Growth', monthlyPrice: 3000, yearlyPrice: 30000, isActive: true })
  assert.equal(parsePlan(form({ name: 'Free', monthlyPrice: '0' })).ok, true)           // a free plan is allowed
  assert.equal(parsePlan(form({ name: 'G', monthlyPrice: '3000' })).ok, false)
  assert.equal(parsePlan(form({ name: 'Growth', monthlyPrice: '' })).ok, false)
  assert.equal(parsePlan(form({ name: 'Growth', monthlyPrice: '-1' })).ok, false)
  assert.equal(parsePlan(form({ name: 'Growth', monthlyPrice: '10', yearlyPrice: '0' })).ok, false)
})

test('cost form', () => {
  const ok = parseCost(form({ name: 'Neon database', category: 'database', monthlyAmount: '5500', isActive: 'on', storeId: '' }))
  assert.equal(ok.ok && ok.value.storeId, null)
  assert.equal(ok.ok && ok.value.category, 'database')
  assert.equal(parseCost(form({ name: 'X', monthlyAmount: '5' })).ok, false)
  assert.equal(parseCost(form({ name: 'Hosting', monthlyAmount: '0' })).ok, false)
  assert.equal(parseCost(form({ name: 'Hosting', monthlyAmount: '99999999' })).ok, false)
  assert.equal((parseCost(form({ name: 'Hosting', category: 'nonsense', monthlyAmount: '5' })) as { ok: true; value: { category: string } }).value.category, 'other')
})

test('new store form', () => {
  const good = { name: 'Rooh Arka', slug: 'rooh-arka', ownerName: 'Ali Raza', ownerEmail: 'ali@example.com', ownerPhone: '0300 1234567' }
  const ok = parseNewStore(form(good))
  assert.equal(ok.ok && ok.value.ownerPhone, '+923001234567')
  assert.equal(parseNewStore(form({ ...good, slug: 'Bad Slug' })).ok, false)
  assert.equal(parseNewStore(form({ ...good, slug: 'ab' })).ok, false)
  assert.equal(parseNewStore(form({ ...good, ownerEmail: 'nope' })).ok, false)
  assert.equal(parseNewStore(form({ ...good, ownerPhone: '12345' })).ok, false)
  assert.equal(parseNewStore(form({ ...good, ownerPhone: '' })).ok, true)
  assert.equal(parseNewStore(form({ ...good, name: '' })).ok, false)
})

test('status form: suspending needs a reason', () => {
  assert.equal(parseStoreStatus(form({ status: 'SUSPENDED' })).ok, false)
  assert.equal(parseStoreStatus(form({ status: 'SUSPENDED', reason: 'Unpaid for 2 months' })).ok, true)
  assert.equal(parseStoreStatus(form({ status: 'ACTIVE' })).ok, true)
  assert.equal(parseStoreStatus(form({ status: 'DELETED' })).ok, false)
})

test('subscription form', () => {
  const ok = parseSubscription(form({ planId: 'p1', status: 'ACTIVE', interval: 'YEARLY', priceOverride: '25000' }))
  assert.deepEqual(ok.ok && ok.value, { planId: 'p1', status: 'ACTIVE', interval: 'YEARLY', priceOverride: 25000, trialDays: 14 })
  assert.equal(parseSubscription(form({ planId: 'p1', status: 'ACTIVE', priceOverride: '0' })).ok, true)
  assert.equal((parseSubscription(form({ planId: 'p1', status: 'ACTIVE', priceOverride: '' })) as { ok: true; value: { priceOverride: number | null } }).value.priceOverride, null)
  assert.equal(parseSubscription(form({ status: 'ACTIVE' })).ok, false)
  assert.equal(parseSubscription(form({ planId: 'p1', status: 'WEIRD' })).ok, false)
  assert.equal(parseSubscription(form({ planId: 'p1', status: 'ACTIVE', priceOverride: 'free' })).ok, false)
  assert.equal(parseSubscription(form({ planId: 'p1', status: 'TRIALING', trialDays: '999' })).ok, false)
})

test('service fee and mark-paid forms', () => {
  assert.equal(parseServiceFee(form({ serviceKey: 'sms-otp', fee: '250' })).ok, true)
  assert.equal(parseServiceFee(form({ serviceKey: 'sms-otp' })).ok, true) // empty fee = 0
  assert.equal(parseServiceFee(form({ serviceKey: '../x', fee: '1' })).ok, false)
  assert.equal(parseServiceFee(form({ serviceKey: 'tcs', fee: '-1' })).ok, false)
  assert.equal(parseMarkPaid(form({ method: 'bank', reference: 'TXN123' })).ok, true)
  assert.equal(parseMarkPaid(form({ method: 'crypto' })).ok, false)
  assert.equal(parseMarkPaid(form({ method: 'cash', reference: 'x'.repeat(61) })).ok, false)
})
