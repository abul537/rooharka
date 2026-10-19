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

import { pickService, parseServiceForm, serviceDef, SERVICES, type ServiceView } from '@/lib/services/registry'
import { encryptJson, decryptJson, signToken, verifyToken, maskSecret } from '@/lib/secrets'

const view = (key: string, o: Partial<ServiceView> = {}): ServiceView => ({ key, enabled: true, isDefault: false, values: {}, masked: {}, configured: true, lastError: null, lastCheckedAt: null, ...o })
test('pickService: default wins; a single enabled service is used; unconfigured/disabled are skipped', () => {
  assert.equal(pickService([view('postex'), view('leopards', { isDefault: true })], 'COURIER'), 'leopards')
  assert.equal(pickService([view('postex'), view('leopards', { enabled: false })], 'COURIER'), 'postex')
  assert.equal(pickService([view('postex'), view('leopards')], 'COURIER'), null, 'two enabled, no default: ambiguous')
  assert.equal(pickService([view('twilio', { configured: false })], 'MESSAGING'), null)
  assert.equal(pickService([view('twilio')], 'COURIER'), null, 'wrong type')
})
test('service forms: secrets kept when blank, patterns enforced', () => {
  const tw = serviceDef('twilio')!
  const G = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k] : null) })
  const first = parseServiceForm(tw, G({ 'twilio.accountSid': 'AC' + 'a'.repeat(32), 'twilio.authToken': 'tok123456', 'twilio.smsFrom': '+15551234567' }))
  assert.ok(first.ok && first.value.credentials.authToken === 'tok123456')
  const again = parseServiceForm(tw, G({ 'twilio.accountSid': 'AC' + 'a'.repeat(32), 'twilio.authToken': '' }), { authToken: 'tok123456' })
  assert.ok(again.ok && again.value.credentials.authToken === 'tok123456', 'blank secret keeps the saved one')
  assert.ok(!parseServiceForm(tw, G({ 'twilio.accountSid': 'nope', 'twilio.authToken': 'x' })).ok)
  assert.ok(!parseServiceForm(tw, G({ 'twilio.accountSid': 'AC' + 'a'.repeat(32) })).ok, 'secret required the first time')
  assert.equal(new Set(SERVICES.map((s) => s.key)).size, SERVICES.length, 'unique keys')
})
test('secrets: encryption round trip, tamper detection, signed tokens', () => {
  const enc = encryptJson({ a: 'secret' }); assert.ok(!enc.includes('secret')); assert.deepEqual(decryptJson(enc), { a: 'secret' })
  assert.throws(() => decryptJson(enc.slice(0, -2) + 'AA'))
  const t = signToken('otp', { p: '+92300' }, 60, 1_000_000)
  assert.equal(verifyToken<{ p: string }>('otp', t, 1_000_000 + 59_000)?.p, '+92300')
  assert.equal(verifyToken('otp', t, 1_000_000 + 61_000), null, 'expired')
  assert.equal(verifyToken('other', t, 1_000_000), null, 'wrong purpose')
  assert.equal(verifyToken('otp', t.replace(/.$/, 'x'), 1_000_000), null, 'tampered')
  assert.equal(maskSecret('abcdefgh'), '••••efgh')
})

import { testConnection } from '@/lib/services/connection-test'
test('connection tests map provider answers to plain messages', async () => {
  const mk = (status: number) => (async () => new Response('{}', { status })) as unknown as typeof fetch
  assert.deepEqual(await testConnection('cloudinary', { cloudName: 'd', apiKey: '1', apiSecret: 's' }, {}, mk(200)), { ok: true, message: 'Connected to Cloudinary.' })
  const bad = await testConnection('cloudinary', { cloudName: 'd', apiKey: '1', apiSecret: 's' }, {}, mk(401)); assert.ok(!bad.ok && /rejected/.test(bad.error))
  const tw = await testConnection('twilio', { accountSid: 'AC1', authToken: 't' }, {}, mk(401)); assert.ok(!tw.ok && /Twilio rejected/.test(tw.error))
  const down = await testConnection('twilio', { accountSid: 'AC1', authToken: 't' }, {}, (async () => { throw new Error('net') }) as unknown as typeof fetch); assert.ok(!down.ok && /Could not reach/.test(down.error))
})
