import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signToken } from '@/lib/secrets'
import {
  RESEND_COOLDOWN_SECONDS, cleanCode, decideSend, decideVerify, generateCode, hashCode, isPhoneVerified, messageText, parseOtpSettings,
  resolveProvider, verifiedPhone, type PendingCode,
} from '@/lib/otp/rules'
import { renderHttpSms, sendViaHttpSms, sendViaTwilio } from '@/lib/otp/senders'
import type { ServiceView } from '@/lib/services/registry'

const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null })
const view = (key: string, p: Partial<ServiceView> = {}): ServiceView =>
  ({ key, enabled: true, isDefault: false, values: {}, masked: {}, configured: true, lastError: null, lastCheckedAt: null, ...p })

// ---------------------------------------------------------------- settings
test('OTP settings: defaults, switch and limits', () => {
  const r = parseOtpSettings(form({ phoneVerificationEnabled: 'on', otpChannel: 'WHATSAPP' }))
  assert.equal(r.ok && r.value.enabled, true)
  assert.equal(r.ok && r.value.channel, 'WHATSAPP')
  assert.equal(r.ok && r.value.length, 6)
  assert.equal(parseOtpSettings(form({})).ok && (parseOtpSettings(form({})) as { ok: true; value: { enabled: boolean } }).value.enabled, false)
})

test('OTP settings: out-of-range or garbage values are refused with a message', () => {
  const bads = [{ otpLength: '3' }, { otpLength: '9' }, { otpLength: 'abc' }, { otpLength: '1e3' }, { otpExpiryMinutes: '0' }, { otpExpiryMinutes: '31' },
    { otpMaxAttempts: '0' }, { otpMaxAttempts: '11' }, { otpDailyLimit: '0' }, { otpDailyLimit: '99999' }, { otpDailyLimit: '-5' }]
  for (const bad of bads) assert.equal(parseOtpSettings(form(bad)).ok, false, JSON.stringify(bad))
})

// --------------------------------------------------------------- providers
test('provider: Twilio needs the sender for the channel; the HTTP gateway is SMS only', () => {
  const sms = [view('twilio', { values: { smsFrom: '+1555' } })]
  assert.deepEqual(resolveProvider(sms, 'SMS'), { key: 'twilio' })
  assert.ok('problem' in resolveProvider(sms, 'WHATSAPP'))                       // no WhatsApp number
  assert.deepEqual(resolveProvider([view('twilio', { values: { whatsappFrom: '+1415' } })], 'WHATSAPP'), { key: 'twilio' })
  assert.deepEqual(resolveProvider([view('http-sms')], 'SMS'), { key: 'http-sms' })
  assert.ok('problem' in resolveProvider([view('http-sms')], 'WHATSAPP'))
})

test('provider: switched-off, unconfigured and non-messaging services never count', () => {
  assert.ok('problem' in resolveProvider([view('twilio', { enabled: false, values: { smsFrom: 'x' } })], 'SMS'))
  assert.ok('problem' in resolveProvider([view('twilio', { configured: false, values: { smsFrom: 'x' } })], 'SMS'))
  assert.ok('problem' in resolveProvider([view('postex')], 'SMS'))
  assert.ok('problem' in resolveProvider([], 'SMS'))
})

test('provider: the owner\'s default wins when two are ready', () => {
  const both = [view('twilio', { values: { smsFrom: '+1555' } }), view('http-sms', { isDefault: true })]
  assert.deepEqual(resolveProvider(both, 'SMS'), { key: 'http-sms' })
})

// ------------------------------------------------------------------- codes
test('codes: right length, digits only, and not constant', () => {
  const codes = new Set(Array.from({ length: 50 }, () => generateCode(6)))
  assert.ok([...codes].every((c) => /^\d{6}$/.test(c)))
  assert.ok(codes.size > 40)
  assert.equal(generateCode(4, () => 7), '7777')
})

test('hash: bound to store, phone and code', () => {
  const h = hashCode('s1', '+923001234567', '123456')
  assert.equal(h, hashCode('s1', '+923001234567', '123456'))
  assert.notEqual(h, hashCode('s2', '+923001234567', '123456'))
  assert.notEqual(h, hashCode('s1', '+923001234568', '123456'))
  assert.notEqual(h, hashCode('s1', '+923001234567', '123457'))
  assert.match(h, /^[a-f0-9]{64}$/)
  assert.ok(!h.includes('123456'))
})

test('cleanCode accepts only exactly N digits (spaces ignored)', () => {
  assert.equal(cleanCode('123 456', 6), '123456')
  for (const bad of ['12345', '1234567', 'abcdef', '12345a', '', null, 123456, '１２３４５６']) assert.equal(cleanCode(bad, 6), null, String(bad))
})

test('message text carries the code and cannot be bent by a store name', () => {
  const m = messageText('Mp<script>&Co', '123456', 5)
  assert.ok(m.startsWith('123456 is your '))
  assert.ok(!m.includes('<'))
  assert.match(m, /5 minutes/)
  assert.ok(messageText('', '1', 1).includes('Store'))
})

// ----------------------------------------------------------------- sending
const NOW = new Date('2026-10-21T10:00:00Z')
const ago = (s: number) => new Date(NOW.getTime() - s * 1000)

test('send: first code is allowed', () => {
  assert.deepEqual(decideSend({ lastSentAt: null, sentLastHour: 0, sentToday: 0 }, { dailyLimit: 200 }, NOW), { ok: true })
})

test('send: resend cooldown, with the seconds left', () => {
  const r = decideSend({ lastSentAt: ago(20), sentLastHour: 1, sentToday: 1 }, { dailyLimit: 200 }, NOW)
  assert.equal(!r.ok && r.reason, 'COOLDOWN')
  assert.equal(!r.ok && r.retryAfterSeconds, RESEND_COOLDOWN_SECONDS - 20)
  assert.equal(decideSend({ lastSentAt: ago(61), sentLastHour: 1, sentToday: 1 }, { dailyLimit: 200 }, NOW).ok, true)
})

test('send: per-number hourly cap and the owner\'s daily cost cap', () => {
  const hour = decideSend({ lastSentAt: ago(600), sentLastHour: 5, sentToday: 5 }, { dailyLimit: 200 }, NOW)
  assert.equal(!hour.ok && hour.reason, 'PHONE_LIMIT')
  const day = decideSend({ lastSentAt: null, sentLastHour: 0, sentToday: 200 }, { dailyLimit: 200 }, NOW)
  assert.equal(!day.ok && day.reason, 'DAILY_LIMIT')
  assert.equal(decideSend({ lastSentAt: null, sentLastHour: 0, sentToday: 199 }, { dailyLimit: 200 }, NOW).ok, true)
})

// ------------------------------------------------------------------ verify
const equal = (a: string, b: string) => a === b
const pending = (p: Partial<PendingCode> = {}): PendingCode => ({ codeHash: 'h', attempts: 0, expiresAt: new Date(NOW.getTime() + 60_000), verifiedAt: null, ...p })

test('verify: right code passes', () => assert.deepEqual(decideVerify(pending(), 'h', 5, NOW, equal), { ok: true }))

test('verify: wrong code counts down the tries, then says to ask again', () => {
  const a = decideVerify(pending({ attempts: 0 }), 'x', 5, NOW, equal)
  assert.equal(!a.ok && a.reason, 'WRONG')
  assert.equal(!a.ok && a.attemptsLeft, 4)
  const last = decideVerify(pending({ attempts: 4 }), 'x', 5, NOW, equal)
  assert.equal(!last.ok && last.attemptsLeft, 0)
  assert.match(!last.ok ? last.message : '', /new code/)
})

test('verify: locked, expired, used and missing codes are refused even with the right code', () => {
  assert.equal((decideVerify(pending({ attempts: 5 }), 'h', 5, NOW, equal) as { reason: string }).reason, 'LOCKED')
  assert.equal((decideVerify(pending({ expiresAt: ago(1) }), 'h', 5, NOW, equal) as { reason: string }).reason, 'EXPIRED')
  assert.equal((decideVerify(pending({ verifiedAt: ago(5) }), 'h', 5, NOW, equal) as { reason: string }).reason, 'NO_CODE')
  assert.equal((decideVerify(null, 'h', 5, NOW, equal) as { reason: string }).reason, 'NO_CODE')
})

// ------------------------------------------------------- the verified cookie
test('cookie: valid only for the same store AND the same phone', () => {
  const t = signToken('phone', { s: 'store1', p: '+923001234567' }, 600)
  assert.equal(isPhoneVerified(t, 'store1', '+923001234567'), true)
  assert.equal(isPhoneVerified(t, 'store2', '+923001234567'), false)  // another store
  assert.equal(isPhoneVerified(t, 'store1', '+923009999999'), false)  // another phone
  assert.equal(verifiedPhone(t, 'store1'), '+923001234567')
  assert.equal(verifiedPhone(t, 'store2'), null)
})

test('cookie: expired, forged, empty and wrong-purpose tokens are rejected', () => {
  const expired = signToken('phone', { s: 'store1', p: '+923001234567' }, 600, Date.now() - 3_600_000)
  assert.equal(isPhoneVerified(expired, 'store1', '+923001234567'), false)
  const t = signToken('phone', { s: 'store1', p: '+923001234567' }, 600)
  const forged = `${Buffer.from(JSON.stringify({ s: 'store1', p: '+923009999999', exp: 9999999999 })).toString('base64url')}.${t.split('.')[1]}`
  assert.equal(isPhoneVerified(forged, 'store1', '+923009999999'), false)
  assert.equal(isPhoneVerified(undefined, 'store1', '+923001234567'), false)
  assert.equal(isPhoneVerified('', 'store1', '+923001234567'), false)
  const other = signToken('something-else', { s: 'store1', p: '+923001234567' }, 600)
  assert.equal(isPhoneVerified(other, 'store1', '+923001234567'), false)
})

// ----------------------------------------------------------------- senders
test('HTTP SMS template: values are URL-encoded so nothing can add parameters', () => {
  const r = renderHttpSms({ method: 'GET', url: 'https://sms.pk/api?key={secret}&to={to}&text={message}' }, 'k&ey', '+923001234567', 'Code 1&to=999 ok')
  assert.equal(r.method, 'GET')
  const u = new URL(r.url)
  assert.equal(u.searchParams.get('to'), '923001234567')
  assert.equal(u.searchParams.get('key'), 'k&ey')
  assert.equal(u.searchParams.get('text'), 'Code 1&to=999 ok')
  assert.deepEqual([...u.searchParams.keys()], ['key', 'to', 'text'])
})

test('HTTP SMS template: local number form and POST body', () => {
  const r = renderHttpSms({ method: 'POST', url: 'https://sms.pk/send', body: 'n={to_local}&m={message}' }, '', '+923001234567', 'hi there')
  assert.equal(r.method, 'POST')
  assert.equal(r.body, 'n=03001234567&m=hi%20there')
})

test('HTTP SMS send: success text, error status and blocked addresses', async () => {
  const cfg = { method: 'GET', url: 'https://sms.pk/api?to={to}', successText: 'OK' }
  const ok = await sendViaHttpSms({}, cfg, '+923001234567', 'x', async () => ({ status: 200, ok: true, text: 'Status: ok' }))
  assert.equal(ok.ok, true)
  const notConfirmed = await sendViaHttpSms({}, cfg, '+923001234567', 'x', async () => ({ status: 200, ok: true, text: 'ERROR 12' }))
  assert.equal(notConfirmed.ok, false)
  const http = await sendViaHttpSms({}, cfg, '+923001234567', 'x', async () => ({ status: 500, ok: false, text: '' }))
  assert.equal(http.ok, false)
  const blocked = await sendViaHttpSms({}, cfg, '+923001234567', 'x', async () => { throw new Error('That address is not allowed.') })
  assert.match(!blocked.ok ? blocked.error : '', /not allowed/)
  const net = await sendViaHttpSms({}, cfg, '+923001234567', 'x', async () => { throw new Error('ECONNRESET secret-key-123') })
  assert.ok(!net.ok && !net.error.includes('secret-key-123')) // raw network errors never leak to the screen
})

test('Twilio: SMS and WhatsApp use the right numbers; keys never appear in errors', async () => {
  const seen: { url: string; body: URLSearchParams; auth: string }[] = []
  const f = (async (url: string, init: RequestInit) => {
    seen.push({ url, body: new URLSearchParams(String(init.body)), auth: (init.headers as Record<string, string>).Authorization })
    return new Response(JSON.stringify({ sid: 'SM1' }), { status: 201 })
  }) as unknown as typeof fetch
  const creds = { accountSid: 'AC' + 'a'.repeat(32), authToken: 'tok' }
  const cfg = { smsFrom: '+15551234567', whatsappFrom: '+14155238886' }
  assert.equal((await sendViaTwilio(creds, cfg, 'SMS', '+923001234567', 'hi', f)).ok, true)
  assert.equal(seen[0].body.get('To'), '+923001234567')
  assert.equal(seen[0].body.get('From'), '+15551234567')
  assert.match(seen[0].auth, /^Basic /)
  assert.equal((await sendViaTwilio(creds, cfg, 'WHATSAPP', '+923001234567', 'hi', f)).ok, true)
  assert.equal(seen[1].body.get('To'), 'whatsapp:+923001234567')
  assert.equal(seen[1].body.get('From'), 'whatsapp:+14155238886')

  const noSender = await sendViaTwilio(creds, {}, 'SMS', '+923001234567', 'hi', f)
  assert.equal(noSender.ok, false)
  const rejected = await sendViaTwilio(creds, cfg, 'SMS', '+923001234567', 'hi', (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch)
  assert.match(!rejected.ok ? rejected.error : '', /rejected/)
  const down = await sendViaTwilio(creds, cfg, 'SMS', '+923001234567', 'hi', (async () => { throw new Error('boom tok') }) as unknown as typeof fetch)
  assert.ok(!down.ok && !down.error.includes('tok'))
})
