import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  base32Decode, base32Encode, cleanTotp, generateRecoveryCodes, generateSecret, groupKey, looksLikeRecovery, normalizeRecovery, otpauthUri, stepOf, totpAt, verifyTotp,
} from '@/lib/auth/totp'
import { passwordChangeProblem } from '@/lib/auth/account-rules'

// RFC 6238 appendix B (SHA-1): secret is the ASCII text 12345678901234567890; the RFC lists 8-digit codes, ours are the last 6.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'))
const RFC: [number, string][] = [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037'], [20000000000, '353130']]

test('base32 round-trips and matches the RFC secret', () => {
  assert.equal(RFC_SECRET, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
  assert.deepEqual(base32Decode(RFC_SECRET), Buffer.from('12345678901234567890'))
  const random = generateSecret()
  assert.equal(random.length, 32)
  assert.deepEqual(base32Decode(base32Encode(Buffer.from(random))), Buffer.from(random))
})

test('base32Decode tolerates spaces, dashes and lower case, and rejects junk', () => {
  assert.deepEqual(base32Decode('gezd gnbv-GY3T QOJQ GEZD GNBV GY3T QOJQ'), Buffer.from('12345678901234567890'))
  for (const bad of ['', '   ', '1', '0189', 'AB!D', 'hello world?']) assert.equal(base32Decode(bad), null, bad)
})

test('TOTP matches the official RFC 6238 test vectors', () => {
  for (const [t, code] of RFC) assert.equal(totpAt(RFC_SECRET, t * 1000), code, `t=${t}`)
})

test('verifyTotp accepts the current code and one step of clock drift, but not more', () => {
  const now = 1_700_000_000_000
  const code = totpAt(RFC_SECRET, now)
  assert.equal(verifyTotp(RFC_SECRET, code, now), stepOf(now))
  assert.equal(verifyTotp(RFC_SECRET, code, now + 30_000), stepOf(now)) // phone 30s behind
  assert.equal(verifyTotp(RFC_SECRET, code, now - 30_000), stepOf(now))
  assert.equal(verifyTotp(RFC_SECRET, code, now + 90_000), null)
  assert.equal(verifyTotp(RFC_SECRET, code, now - 90_000), null)
})

test('verifyTotp refuses a step that was already used (no replay)', () => {
  const now = 1_700_000_000_000
  const code = totpAt(RFC_SECRET, now)
  const step = verifyTotp(RFC_SECRET, code, now)!
  assert.equal(verifyTotp(RFC_SECRET, code, now, step), null) // same code again
  assert.equal(verifyTotp(RFC_SECRET, code, now, step - 1), step) // an older used step does not block it
  assert.notEqual(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now + 30_000), now + 30_000, step), null) // the next code still works
})

test('verifyTotp rejects malformed input without throwing', () => {
  const now = 1_700_000_000_000
  for (const bad of ['', '12345', '1234567', 'abcdef', '12 34', '１２３４５６', "123456'; --"]) assert.equal(verifyTotp(RFC_SECRET, bad, now), null, bad)
  assert.equal(verifyTotp('not base32!!', '123456', now), null)
  assert.throws(() => totpAt('not base32!!', now))
})

test('codes typed with spaces or dashes are understood', () => {
  const now = 1_700_000_000_000
  const code = totpAt(RFC_SECRET, now)
  assert.equal(cleanTotp(`${code.slice(0, 3)} ${code.slice(3)}`), code)
  assert.notEqual(verifyTotp(RFC_SECRET, `${code.slice(0, 3)}-${code.slice(3)}`, now), null)
})

test('otpauth link carries the issuer, the account and the secret, safely encoded', () => {
  const uri = otpauthUri('Rooharka', 'a b+c@x.pk', RFC_SECRET)
  assert.ok(uri.startsWith('otpauth://totp/Rooharka:a%20b%2Bc%40x.pk?'))
  assert.ok(uri.includes(`secret=${RFC_SECRET}`) && uri.includes('issuer=Rooharka') && uri.includes('digits=6') && uri.includes('period=30'))
  assert.equal(groupKey('ABCDEFGHIJ'), 'ABCD EFGH IJ')
})

test('recovery codes: 8 unique, readable, and recognised by shape', () => {
  const codes = generateRecoveryCodes()
  assert.equal(codes.length, 8)
  assert.equal(new Set(codes).size, 8)
  for (const c of codes) {
    assert.match(c, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
    assert.equal(looksLikeRecovery(c), true)
    assert.equal(looksLikeRecovery(c.toLowerCase().replace(/-/g, ' ')), true) // typed loosely
    assert.equal(normalizeRecovery(c.toLowerCase()), normalizeRecovery(c))
  }
  assert.equal(looksLikeRecovery('123456'), false)
  assert.equal(looksLikeRecovery('123 456'), false)
})

test('password change: each mistake gets its own clear message', () => {
  const ok = { current: 'old password 1', next: 'a brand new passphrase', confirm: 'a brand new passphrase', email: 'owner@shop.pk' }
  assert.equal(passwordChangeProblem(ok), null)
  assert.match(passwordChangeProblem({ ...ok, current: '' })!, /current password/i)
  assert.match(passwordChangeProblem({ ...ok, next: '', confirm: '' })!, /new password/i)
  assert.match(passwordChangeProblem({ ...ok, confirm: 'something else entirely' })!, /do not match/i)
  assert.match(passwordChangeProblem({ ...ok, next: ok.current, confirm: ok.current })!, /different/i)
  assert.match(passwordChangeProblem({ ...ok, next: 'short one', confirm: 'short one' })!, /12 characters/)
  assert.match(passwordChangeProblem({ ...ok, next: 'owner-is-my-name-1', confirm: 'owner-is-my-name-1' })!, /email/i)
  assert.match(passwordChangeProblem({ ...ok, next: 'aaaaaaaaaaaaaaaa', confirm: 'aaaaaaaaaaaaaaaa' })!, /repetitive/i)
})

// ------------------------------------------------------------------ domains
import { hostCandidates, isValidDomain, normalizeHost, parseDomainInput } from '@/lib/domains'

test('normalizeHost: lower-cases, drops port and trailing dot, takes the first of a list', () => {
  assert.equal(normalizeHost('Shop.Example.PK:3000'), 'shop.example.pk')
  assert.equal(normalizeHost('shop.example.pk.'), 'shop.example.pk')
  assert.equal(normalizeHost('a.pk, b.pk'), 'a.pk')
  assert.equal(normalizeHost(''), null)
  assert.equal(normalizeHost(null), null)
  assert.equal(normalizeHost('[::1]:3000'), null)
  assert.equal(normalizeHost('x'.repeat(300) + '.pk'), null)
})

test('isValidDomain: real names yes; IPs, internal names and junk no', () => {
  for (const ok of ['shop.pk', 'my-shop.com.pk', 'a.b.c.store', 'xn--80ak6aa92e.com', 'darwaish.pk']) assert.equal(isValidDomain(ok), true, ok)
  for (const bad of ['localhost', 'shop', '127.0.0.1', '10.0.0.5', 'shop.local', 'shop.internal', 'a..pk', '-shop.pk', 'shop-.pk', 'sh op.pk', 'shop.p', 'shop.123', 'sh_op.pk', 'shop.pk/evil', '', 'x.y']) assert.equal(isValidDomain(bad), false, bad)
  assert.equal(isValidDomain(`${'a'.repeat(64)}.pk`), false) // label too long
})

test('hostCandidates also tries the address without www', () => {
  assert.deepEqual(hostCandidates('www.shop.pk'), ['www.shop.pk', 'shop.pk'])
  assert.deepEqual(hostCandidates('shop.pk'), ['shop.pk'])
})

test('parseDomainInput accepts pasted links and explains mistakes', () => {
  assert.deepEqual(parseDomainInput(' HTTPS://Shop.Example.pk/some/page?x=1 '), { ok: true, host: 'shop.example.pk' })
  assert.deepEqual(parseDomainInput('shop.pk:8080'), { ok: true, host: 'shop.pk' })
  for (const bad of ['', '   ', 'localhost', '192.168.1.1', 'not a domain', 'javascript:alert(1)']) assert.equal(parseDomainInput(bad).ok, false, bad)
})
