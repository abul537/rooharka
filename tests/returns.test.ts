import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canMove, isOpen, readReturnPolicy, parseReturnPolicy, returnWindow, pickReturnLines, alreadyReturned, readReturnLines, linesValue, parseReturnAsk, refundCeiling, parseRefund, DEFAULT_RETURN_POLICY, type OrderLine } from '../lib/returns.ts'

const day = 86_400_000, now = new Date('2026-11-20T10:00:00Z')
const order: OrderLine[] = [
  { id: 'a', productId: 'p1', variantId: 'v1', name: 'Shirt', variantLabel: 'M', quantity: 3, unitCode: null, unitPrice: 1000, lineTotal: 3000 },
  { id: 'b', productId: 'p2', variantId: 'v2', name: 'Rice', quantity: 2500, unitCode: 'kg', unitPrice: 300, lineTotal: 750 },
]

test('the steps only move forward, and a finished return never moves again', () => {
  assert.ok(canMove('REQUESTED', 'APPROVED')); assert.ok(canMove('REQUESTED', 'REJECTED')); assert.ok(canMove('APPROVED', 'RECEIVED')); assert.ok(canMove('RECEIVED', 'COMPLETED'))
  assert.equal(canMove('REQUESTED', 'COMPLETED'), false); assert.equal(canMove('RECEIVED', 'REJECTED'), false)
  assert.equal(canMove('COMPLETED', 'APPROVED'), false); assert.equal(canMove('REJECTED', 'APPROVED'), false); assert.equal(canMove('nonsense', 'APPROVED'), false)
  assert.ok(isOpen('APPROVED')); assert.equal(isOpen('COMPLETED'), false)
})

test('the policy is off until the owner switches it on; bad saved values fall back', () => {
  assert.deepEqual(readReturnPolicy(null), DEFAULT_RETURN_POLICY)
  assert.deepEqual(readReturnPolicy({ returns: { enabled: 'yes', days: 900, text: 5 } }), { enabled: false, days: 7, text: '' })
  assert.deepEqual(readReturnPolicy({ returns: { enabled: true, days: 14, text: ' Unused items only ' } }), { enabled: true, days: 14, text: 'Unused items only' })
  const form = (o: Record<string, unknown>) => (k: string) => o[k]
  assert.equal(parseReturnPolicy(form({ days: '0' })).ok, false); assert.equal(parseReturnPolicy(form({ days: '61' })).ok, false)
  assert.deepEqual(parseReturnPolicy(form({ days: '10', enabled: 'on', text: 'x' })), { ok: true, value: { enabled: true, days: 10, text: 'x' } })
})

test('a customer may ask only for a delivered order, inside the window, with nothing open', () => {
  const p = { enabled: true, days: 7, text: '' }, delivered = new Date(now.getTime() - 2 * day)
  assert.deepEqual(returnWindow(p, { status: 'DELIVERED', deliveredAt: delivered }, false, now), { allowed: true, daysLeft: 5 })
  assert.equal(returnWindow(p, { status: 'DELIVERED', deliveredAt: new Date(now.getTime() - 7 * day) }, false, now).allowed, false)
  assert.equal(returnWindow(p, { status: 'SHIPPED', deliveredAt: delivered }, false, now).allowed, false)
  assert.equal(returnWindow(p, { status: 'DELIVERED', deliveredAt: null }, false, now).allowed, false)
  assert.equal(returnWindow(p, { status: 'DELIVERED', deliveredAt: delivered }, true, now).allowed, false)
  assert.equal(returnWindow({ ...p, enabled: false }, { status: 'DELIVERED', deliveredAt: delivered }, false, now).allowed, false)
})

test('picked lines are checked against the real order: no more than was bought, nothing twice', () => {
  const r = pickReturnLines(order, [{ id: 'a', quantity: 99 }, { id: 'zzz', quantity: 1 }], new Map())
  assert.ok(r.ok); if (r.ok) assert.deepEqual(r.lines, [{ itemId: 'a', productId: 'p1', variantId: 'v1', name: 'Shirt (M)', quantity: 3, unitCode: null, amount: 3000 }])
  const part = pickReturnLines(order, [{ id: 'a', quantity: 1 }], new Map([['a', 2]]))
  assert.ok(part.ok); if (part.ok) { assert.equal(part.lines[0].quantity, 1); assert.equal(part.lines[0].amount, 1000) }
  assert.equal(pickReturnLines(order, [{ id: 'a', quantity: 1 }], new Map([['a', 3]])).ok, false)
  assert.equal(pickReturnLines(order, [{ id: 'nope', quantity: 1 }], new Map()).ok, false)
})

test('an empty pick means everything; weighed products come back as the whole line', () => {
  const all = pickReturnLines(order, [], new Map())
  assert.ok(all.ok); if (all.ok) { assert.deepEqual(all.lines.map((l) => [l.itemId, l.quantity]), [['a', 3], ['b', 2500]]); assert.equal(linesValue(all.lines), 3750) }
  const rice = pickReturnLines(order, [{ id: 'b', quantity: 1 }], new Map())
  assert.ok(rice.ok); if (rice.ok) assert.equal(rice.lines[0].quantity, 2500)
})

test('what earlier returns cover is counted, refused ones are not; stored lines are never trusted', () => {
  const items = [{ itemId: 'a', quantity: 2, name: 'Shirt', amount: 2000 }, { itemId: 5, quantity: 1 }, { itemId: 'b', quantity: -1 }, 'junk']
  assert.deepEqual([...alreadyReturned([{ status: 'COMPLETED', items }, { status: 'REJECTED', items }, { status: 'REQUESTED', items: 'x' }])], [['a', 2]])
  assert.equal(readReturnLines(items).length, 1)
})

test('the customer form: a reason is required, "other" needs words, text is cleaned', () => {
  assert.equal(parseReturnAsk(null).ok, false); assert.equal(parseReturnAsk({ reason: 'FREE_MONEY' }).ok, false); assert.equal(parseReturnAsk({ reason: 'toString' }).ok, false); assert.equal(parseReturnAsk({ reason: '__proto__' }).ok, false)
  assert.equal(parseReturnAsk({ reason: 'OTHER', note: 'x' }).ok, false)
  const r = parseReturnAsk({ code: ' MP-1 ', last4: '0300-1234567', reason: 'DAMAGED', note: 'broken\u0000 glass  ' })
  assert.ok(r.ok); if (r.ok) { assert.equal(r.value.code, 'MP-1'); assert.equal(r.value.last4, '4567'); assert.equal(r.value.note, 'broken glass') }
})

test('a refund can never be more than the customer paid, across all returns of the order', () => {
  assert.equal(refundCeiling(3000, 1000), 2000); assert.equal(refundCeiling(0, 0), 0); assert.equal(refundCeiling(1000, 5000), 0)
  const form = (o: Record<string, unknown>) => (k: string) => o[k]
  assert.equal(parseRefund(form({ amount: '2500', method: 'Cash' }), 2000).ok, false)
  assert.equal(parseRefund(form({ amount: '-5', method: 'Cash' }), 2000).ok, false)
  assert.equal(parseRefund(form({ amount: '500', method: 'Bitcoin' }), 2000).ok, false)
  assert.deepEqual(parseRefund(form({ amount: '1,500.50', method: 'JazzCash', ref: ' TX9 ' }), 2000), { ok: true, value: { amount: 1500.5, method: 'JazzCash', ref: 'TX9' } })
  assert.deepEqual(parseRefund(form({ amount: '0' }), 0), { ok: true, value: { amount: 0, method: null, ref: null } })
})

test('code review: returns are store-scoped, guarded, compare-and-set, and the customer route trusts nothing', () => {
  const data = readFileSync('lib/returns-data.ts', 'utf8'), act = readFileSync('app/admin/(panel)/returns/actions.ts', 'utf8'), api = readFileSync('app/api/returns/route.ts', 'utf8')
  for (const m of data.matchAll(/tx\.(returnRequest|order|productVariant)\.(findFirst|updateMany)\(\{ where: \{([^}]*)/g)) assert.match(m[3], /storeId/, m[0])
  assert.equal((data.match(/status: (r\.status|'APPROVED'|'RECEIVED') \}, data/g) ?? []).length, 3) // every step is compare-and-set
  assert.match(data, /refundCeiling\(paid, before\)/); assert.match(data, /RETURN_RESTOCKED/)
  assert.match(act, /what === 'refund' \? 'payments\.confirm' : 'orders\.update'/); assert.match(act, /adminOrError\('settings\.edit'\)/)
  assert.equal((act.match(/audit\(/g) ?? []).length, 5)
  assert.match(api, /rateLimit\(`return:/); assert.match(api, /isPreviewFor/); assert.match(api, /trackingRequiresPhoneLast4/)
  assert.doesNotMatch(api, /refundAmount|amountPaid/)
  assert.match(readFileSync('app/admin/(panel)/returns/page.tsx', 'utf8'), /where: \{ storeId: admin\.storeId/)
})
