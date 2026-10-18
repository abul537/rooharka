import { checkTransition, afterPaymentReceived, NEXT_STATUSES, isValidTrackingNo, type OrderStatus } from '@/lib/admin/order-rules'
import assert from 'node:assert/strict'
import { test } from 'node:test'

test('order status flow', () => {
  let s: OrderStatus = 'PLACED'
  for (const n of ['CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'] as OrderStatus[]) { assert.ok(checkTransition(s, n, false).ok, n); s = n }
  assert.ok(!checkTransition('PLACED', 'SHIPPED', false).ok)
  assert.ok(!checkTransition('DELIVERED', 'PLACED', false).ok)
  for (const t of ['CANCELLED', 'RETURNED'] as const) assert.deepEqual(NEXT_STATUSES[t], [])
  assert.ok(checkTransition('PACKED', 'CANCELLED', false).ok)
  assert.ok(!checkTransition('SHIPPED', 'CANCELLED', false).ok)
  assert.ok(!checkTransition('PLACED', 'CONFIRMED', true).ok, 'unconfirmed advance blocks progress')
  assert.ok(checkTransition('PLACED', 'CANCELLED', true).ok)
})
test('payment totals', () => {
  assert.deepEqual(afterPaymentReceived(2700, 0, 200), { amountPaid: 200, amountDue: 2500, paymentStatus: 'PARTIALLY_PAID' })
  assert.deepEqual(afterPaymentReceived(2700, 200, 2500), { amountPaid: 2700, amountDue: 0, paymentStatus: 'PAID' })
  assert.equal(afterPaymentReceived(2700, 0, 99999).amountPaid, 2700)
  assert.equal(afterPaymentReceived(2700, 0, 0).paymentStatus, 'UNPAID')
})
test('tracking numbers', () => {
  assert.ok(isValidTrackingNo('TCS-12345678')); assert.ok(!isValidTrackingNo('ab')); assert.ok(!isValidTrackingNo('<script>alert(1)</script>'))
})
