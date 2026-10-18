import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hashPassword, verifyPassword, passwordProblem } from '@/lib/auth/password'
import { normalizePkMobile, maskedName, lastFour } from '@/lib/phone'
import { generateTrackingCode, normalizeTrackingCode } from '@/lib/tracking-code'
import { rateLimit } from '@/lib/rate-limit'
import { can } from '@/lib/auth/permissions'
import { startOfPktDay } from '@/lib/admin/dates'

test('passwords: hash, verify, reject weak', async () => {
  const h = await hashPassword('correct horse battery staple')
  assert.ok(await verifyPassword('correct horse battery staple', h))
  assert.ok(!(await verifyPassword('wrong password here!!', h)))
  assert.ok(!(await verifyPassword('x', 'garbage')))
  assert.notEqual(h, await hashPassword('correct horse battery staple'), 'salted')
  assert.ok(passwordProblem('short', 'a@b.com'))
  assert.ok(passwordProblem('aaaaaaaaaaaaaaaa', 'a@b.com'))
  assert.ok(passwordProblem('my-alice-is-here-2024', 'alice@b.com'))
  assert.equal(passwordProblem('Tr0ub4dor&3-horse-staple', 'a@b.com'), null)
})
test('phone helpers', () => {
  assert.equal(normalizePkMobile('0300 123-4567'), '+923001234567')
  assert.equal(normalizePkMobile('12345'), null)
  assert.equal(maskedName('Ali Raza'), 'Ali R.'); assert.equal(lastFour('+923001234567'), '4567')
})
test('tracking codes', () => {
  const c = generateTrackingCode('mppmhk'); assert.match(c, /^[A-Z]{2,4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
  assert.equal(normalizeTrackingCode(` ${c.toLowerCase()} `), c)
})
test('rate limiter blocks after the limit', () => {
  const k = 'test:' + Math.random()
  for (let i = 0; i < 3; i++) assert.ok(rateLimit(k, 3, 60_000).ok)
  assert.ok(!rateLimit(k, 3, 60_000).ok)
})
test('role permissions: staff cannot cancel, confirm payments or edit settings', () => {
  assert.ok(can('STORE_OWNER', 'settings.edit') && can('STORE_STAFF', 'orders.update'))
  for (const p of ['orders.cancel', 'payments.confirm', 'settings.edit', 'products.edit', 'customers.block'] as const) assert.ok(!can('STORE_STAFF', p), p)
  assert.ok(!can('SUPER_ADMIN', 'orders.view') && !can('', 'orders.view'))
})
test('Pakistan day boundaries (UTC+5)', () => {
  // 2026-10-18 02:00 PKT = 2026-10-17 21:00 UTC -> the PKT day began 2026-10-17 19:00 UTC
  assert.equal(startOfPktDay(0, new Date('2026-10-17T21:00:00Z')).toISOString(), '2026-10-17T19:00:00.000Z')
  assert.equal(startOfPktDay(6, new Date('2026-10-17T21:00:00Z')).toISOString(), '2026-10-11T19:00:00.000Z')
})
