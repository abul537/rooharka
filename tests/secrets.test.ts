import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decryptJson, encryptJson, hmacHex, maskSecret, signToken, verifyToken } from '@/lib/secrets'

test('encrypt/decrypt round trip; random IV; tamper detected', () => {
  const v = { apiKey: 'abc123', nested: { n: 1 } }
  const a = encryptJson(v), b = encryptJson(v)
  assert.notEqual(a, b); assert.deepEqual(decryptJson(a), v)
  assert.ok(!a.includes('abc123'))
  const bad = a.slice(0, -3) + (a.endsWith('AAA') ? 'BBB' : 'AAA')
  assert.throws(() => decryptJson(bad))
  assert.throws(() => decryptJson('garbage')); assert.throws(() => decryptJson('v1.AAAA'))
})
test('signed tokens: valid, expired, forged, wrong purpose', () => {
  const t = signToken('otp', { p: '+923001234567' }, 60, 1_000_000)
  assert.equal(verifyToken<{ p: string }>('otp', t, 1_000_000 + 30_000)?.p, '+923001234567')
  assert.equal(verifyToken('otp', t, 1_000_000 + 61_000), null, 'expired')
  assert.equal(verifyToken('other', t, 1_000_000 + 1000), null, 'wrong purpose')
  const [body, sig] = t.split('.')
  const forged = Buffer.from(JSON.stringify({ p: '+923009999999', exp: 99999999999 })).toString('base64url')
  assert.equal(verifyToken('otp', `${forged}.${sig}`, 1_000_000), null, 'forged body')
  assert.equal(verifyToken('otp', `${body}.${sig}.x`, 1_000_000), null); assert.equal(verifyToken('otp', '', 1), null); assert.equal(verifyToken('otp', undefined, 1), null)
})
test('hmac is stable and purpose-separated; mask hides secrets', () => {
  assert.equal(hmacHex('a', 'x'), hmacHex('a', 'x')); assert.notEqual(hmacHex('a', 'x'), hmacHex('b', 'x'))
  assert.equal(maskSecret('sk_live_123456'), '••••3456'); assert.equal(maskSecret('ab'), '••••'); assert.equal(maskSecret(null), '')
})
