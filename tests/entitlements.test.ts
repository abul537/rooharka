import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_STAFF_LIMIT, STAFF_UNLIMITED, effectiveStaffLimit, isOverStaffLimit, parsePosMode, parseStoreStaffLimit, posAccess, staffSlotProblem, staffUsage } from '@/lib/entitlements/rules'
import { POS_PAYMENT_METHODS, cashChange, parseSale, saleTotals, tillSummary } from '@/lib/pos/rules'

const plan = (staff: number | null) => ({ limits: { staff } })

test('staff limit: store override beats plan, plan beats default', () => {
  assert.deepEqual(effectiveStaffLimit({ storeLimit: 7, plan: plan(3) }), { limit: 7, source: 'store' })
  assert.deepEqual(effectiveStaffLimit({ storeLimit: 0, plan: plan(3) }), { limit: 0, source: 'store' })
  assert.deepEqual(effectiveStaffLimit({ storeLimit: STAFF_UNLIMITED, plan: plan(3) }), { limit: null, source: 'store' })
  assert.deepEqual(effectiveStaffLimit({ storeLimit: null, plan: plan(3) }), { limit: 3, source: 'plan' })
  assert.deepEqual(effectiveStaffLimit({ storeLimit: null, plan: plan(null) }), { limit: null, source: 'plan' })
  assert.deepEqual(effectiveStaffLimit({ storeLimit: null, plan: null }), { limit: DEFAULT_STAFF_LIMIT, source: 'default' })
})

test('staff slots: room, full, none included, unlimited', () => {
  assert.equal(staffSlotProblem(2, { limit: 3, source: 'plan' }), null)
  assert.match(staffSlotProblem(3, { limit: 3, source: 'plan' })!, /allows 3 staff logins/)
  assert.match(staffSlotProblem(1, { limit: 1, source: 'plan' })!, /allows 1 staff login and/)
  assert.match(staffSlotProblem(0, { limit: 0, source: 'plan' })!, /does not include staff/)
  assert.equal(staffSlotProblem(500, { limit: null, source: 'plan' }), null)
  assert.equal(isOverStaffLimit(4, { limit: 3, source: 'plan' }), true)
  assert.equal(isOverStaffLimit(3, { limit: 3, source: 'plan' }), false)
  assert.equal(staffUsage(3, { limit: 5, source: 'plan' }), '3 of 5 staff logins used')
  assert.equal(staffUsage(1, { limit: null, source: 'plan' }), '1 staff login (no limit)')
})

test('POS access: store switch wins, otherwise the plan decides', () => {
  assert.deepEqual(posAccess({ mode: 'ON', planFeatures: [] }), { enabled: true, source: 'store' })
  assert.deepEqual(posAccess({ mode: 'OFF', planFeatures: ['pos'] }), { enabled: false, source: 'store' })
  assert.deepEqual(posAccess({ mode: 'PLAN', planFeatures: ['pos', 'tcs'] }), { enabled: true, source: 'plan' })
  assert.deepEqual(posAccess({ mode: 'PLAN', planFeatures: ['tcs'] }), { enabled: false, source: 'plan' })
  assert.deepEqual(posAccess({ mode: 'PLAN', planFeatures: null }), { enabled: false, source: 'plan' })
  assert.deepEqual(posAccess({ mode: 'junk', planFeatures: ['pos'] }), { enabled: true, source: 'plan' })
})

test('CSMI form parsing', () => {
  assert.deepEqual(parseStoreStaffLimit(''), { ok: true, value: null })
  assert.deepEqual(parseStoreStaffLimit(' Unlimited '), { ok: true, value: STAFF_UNLIMITED })
  assert.deepEqual(parseStoreStaffLimit('0'), { ok: true, value: 0 })
  assert.deepEqual(parseStoreStaffLimit('12'), { ok: true, value: 12 })
  for (const bad of ['-1', '1.5', 'abc', '501', '1e2']) assert.equal(parseStoreStaffLimit(bad).ok, false, bad)
  assert.equal(parsePosMode('ON'), 'ON')
  assert.equal(parsePosMode('nope'), null)
})

const sale = (o: Record<string, unknown> = {}) => ({ items: [{ variantId: 'v1', quantity: 2 }], paymentMethod: 'CASH', tendered: '1000', idempotencyKey: 'abcdefgh1', ...o })

test('sale request: valid, merged lines, defaults', () => {
  const r = parseSale(sale({ items: [{ variantId: 'v1', quantity: 1 }, { variantId: 'v1', quantity: '2' }, { variantId: 'v2', quantity: 1 }] }))
  assert.ok(r.ok)
  if (r.ok) {
    assert.deepEqual(r.value.items, [{ variantId: 'v1', quantity: 3 }, { variantId: 'v2', quantity: 1 }])
    assert.equal(r.value.discount, 0)
    assert.equal(r.value.tendered, 1000)
    assert.equal(r.value.customerPhone, null)
  }
})

test('sale request: rejects bad input with a readable message', () => {
  const bad: [Record<string, unknown>, RegExp][] = [
    [{ items: [] }, /at least one item/],
    [{ items: [{ variantId: 'v1', quantity: 0 }] }, /whole number/],
    [{ items: [{ variantId: 'v1', quantity: 1.5 }] }, /whole number/],
    [{ items: [{ variantId: 'v1', quantity: 10_000_001 }] }, /whole number/],
    [{ discount: '-5' }, /discount/],
    [{ discount: 'abc' }, /discount/],
    [{ paymentMethod: 'COD' }, /how the customer paid/],
    [{ tendered: 'x' }, /cash received/],
    [{ customerPhone: '123' }, /mobile number/],
    [{ customerName: 'x'.repeat(81) }, /80 characters/],
    [{ idempotencyKey: 'short' }, /refresh/],
  ]
  for (const [o, re] of bad) { const r = parseSale(sale(o)); assert.ok(!r.ok, JSON.stringify(o)); if (!r.ok) assert.match(r.error, re) }
  assert.ok(!parseSale(null).ok)
  assert.ok(!parseSale(sale({ items: Array.from({ length: 51 }, (_, i) => ({ variantId: `v${i}`, quantity: 1 })) })).ok)
})

test('sale request: tendered is only read for cash; phone is normalised', () => {
  const card = parseSale(sale({ paymentMethod: 'CARD', tendered: 'garbage' }))
  assert.ok(card.ok && card.value.tendered === null)
  const ph = parseSale(sale({ customerPhone: '0300 1234567', customerName: '  Ali   Khan ' }))
  assert.ok(ph.ok && ph.value.customerPhone === '+923001234567' && ph.value.customerName === 'Ali Khan')
  assert.deepEqual([...POS_PAYMENT_METHODS], ['CASH', 'CARD', 'JAZZCASH', 'EASYPAISA', 'BANK_TRANSFER'])
})

test('sale totals and change', () => {
  const t = saleTotals([{ unitPrice: 499.5, quantity: 3 }, { unitPrice: 100, quantity: 1 }], 50)
  assert.ok(t.ok && t.value.subtotal === 1598.5 && t.value.total === 1548.5)
  assert.ok(!saleTotals([{ unitPrice: 100, quantity: 1 }], 100.01).ok)
  const free = saleTotals([{ unitPrice: 100, quantity: 1 }], 100)
  assert.ok(free.ok && free.value.total === 0)
  assert.deepEqual(cashChange(1548.5, 2000), { ok: true, change: 451.5 })
  assert.deepEqual(cashChange(100, null), { ok: true, change: 0 })
  assert.deepEqual(cashChange(100, 100), { ok: true, change: 0 })
  assert.ok(!cashChange(100, 99.99).ok)
  assert.equal(0.1 + 0.2 !== 0.3, true) // why we round to paisa
  const f = saleTotals([{ unitPrice: 0.1, quantity: 1 }, { unitPrice: 0.2, quantity: 1 }], 0)
  assert.ok(f.ok && f.value.total === 0.3)
})

test('till summary ignores cancelled sales and keeps a fixed method order', () => {
  const s = tillSummary([
    { method: 'CARD', total: 500, cancelled: false }, { method: 'CASH', total: 100.1, cancelled: false },
    { method: 'CASH', total: 200.2, cancelled: false }, { method: 'CASH', total: 999, cancelled: true },
  ])
  assert.equal(s.count, 3); assert.equal(s.total, 800.3)
  assert.deepEqual(s.byMethod, [{ method: 'CASH', count: 2, total: 300.3 }, { method: 'CARD', count: 1, total: 500 }])
  assert.deepEqual(tillSummary([]), { count: 0, total: 0, byMethod: [] })
})

import { parseNewMember, parseNewPassword } from '@/lib/team/rules'
import { can } from '@/lib/auth/permissions'
import { readLimits, describePlan } from '@/lib/signup/plans'
import { parsePlan } from '@/lib/csmi/forms'

const form = (o: Record<string, string>) => new Map(Object.entries(o)) as unknown as { get(n: string): string | null }
const member = (o: Record<string, string> = {}) => parseNewMember(form({ name: 'Ayesha Khan', email: 'Ayesha@Shop.pk', role: 'STORE_STAFF', password: 'a-long-starting-pass', ...o }))

test('new team member: valid, lower-cases the email, never an owner', () => {
  const r = member()
  assert.ok(r.ok && r.value.email === 'ayesha@shop.pk' && r.value.role === 'STORE_STAFF')
  assert.ok(!member({ role: 'STORE_OWNER' }).ok)
  assert.ok(!member({ role: 'PLATFORM_OWNER' }).ok)
  assert.ok(!member({ role: '' }).ok)
  assert.ok(!member({ name: 'A' }).ok)
  assert.ok(!member({ email: 'nope' }).ok)
  const weak = member({ password: 'short' })
  assert.ok(!weak.ok && /12 characters/.test(weak.error))
  assert.ok(!member({ password: 'ayesha-is-my-password' }).ok) // contains the email name
  assert.ok(parseNewPassword(form({ password: 'a-different-long-pass' }), 'x@y.pk').ok)
  assert.ok(!parseNewPassword(form({ password: 'tiny' }), 'x@y.pk').ok)
})

test('permissions: only the owner manages the team; everyone on the team may sell', () => {
  assert.equal(can('STORE_OWNER', 'staff.manage'), true)
  assert.equal(can('STORE_MANAGER', 'staff.manage'), false)
  assert.equal(can('STORE_STAFF', 'staff.manage'), false)
  for (const r of ['STORE_OWNER', 'STORE_MANAGER', 'STORE_STAFF']) assert.equal(can(r, 'pos.sell'), true, r)
  assert.equal(can('STORE_STAFF', 'orders.cancel'), false) // cancelling a sale needs a manager
  assert.equal(can('PLATFORM_OWNER', 'pos.sell'), false)
})

test('plan staff limit may be 0 (owner only); POS is a plan feature', () => {
  assert.equal(readLimits({ staff: 0 }).staff, 0)
  assert.equal(readLimits({ staff: -1 }).staff, null)
  assert.equal(describePlan({ limits: { staff: 0 }, features: ['pos'] }).bullets.includes('Owner login only'), true)
  assert.equal(describePlan({ limits: { staff: 0 }, features: ['pos'] }).bullets.includes('POS lite: sell at the counter'), true)
  const p = parsePlan(form({ name: 'Solo', monthlyPrice: '1000', limitStaff: '0', feature_pos: 'on' }))
  assert.ok(p.ok && p.value.show.staff === 0 && p.value.features.includes('pos'))
  assert.ok(!parsePlan(form({ name: 'Solo', monthlyPrice: '1000', limitStaff: '-1' })).ok)
  assert.equal(effectiveStaffLimit({ storeLimit: null, plan: { limits: { staff: 0 } } }).limit, 0)
})
