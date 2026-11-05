import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  RESERVED_SLUGS, hashToken, needsApproval, newVerifyToken, parseSignupForm, requestExpiry, signupGate, slugFromName, slugProblem, splitVerifyToken, trialEnd,
} from '@/lib/signup/rules'
import { DEFAULT_SETTINGS, parseSettingsForm, readSettings } from '@/lib/signup/settings'
import { isPlatformHost, marketingAllowed, platformHosts, platformOrigin, storeAddress, subdomainOf } from '@/lib/platform-host'
import { alreadyRegisteredMail, approvedMail, escapeHtml, mailConfigured, rejectedMail, sendMail, verifyEmailMail } from '@/lib/mail'

const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null })
const good = { ownerName: 'Ali Raza', email: 'Ali@Example.PK ', phone: '0300 1234567', storeName: "Ali's Fashion", slug: 'alis-fashion', planId: 'plan_12345678', interval: 'MONTHLY', password: 'a long safe passphrase', terms: 'on' }

// ------------------------------------------------------------------- slugs
test('slugFromName builds a clean web address', () => {
  assert.equal(slugFromName("Ali's Fashion Store!"), 'alis-fashion-store')
  assert.equal(slugFromName('  Café  Delight  '), 'cafe-delight')
  assert.equal(slugFromName('!!!'), '')
  assert.equal(slugFromName('a'.repeat(50)).length, 30)
  assert.ok(!slugFromName('x'.repeat(29) + ' y').endsWith('-'))
})

test('slugProblem: length, shape and reserved words', () => {
  assert.equal(slugProblem('my-shop'), null)
  for (const bad of ['ab', 'a'.repeat(31), 'My-Shop', '-shop', 'shop-', 'my--shop', 'my_shop', 'my shop', 'دکان']) assert.notEqual(slugProblem(bad), null, bad)
  for (const r of ['www', 'admin', 'csmi', 'api', 'login', 'signup', 'support']) assert.match(slugProblem(r)!, /reserved/, r)
  assert.ok(RESERVED_SLUGS.has('rooharka'))
})

// ------------------------------------------------------------------ the form
test('sign-up form: a good form is cleaned and accepted', () => {
  const r = parseSignupForm(form(good))
  assert.ok(r.ok)
  if (r.ok) {
    assert.equal(r.value.email, 'ali@example.pk')
    assert.equal(r.value.phone, '+923001234567')
    assert.equal(r.value.interval, 'MONTHLY')
    assert.equal(r.value.slug, 'alis-fashion')
  }
  assert.equal(parseSignupForm(form({ ...good, interval: 'YEARLY' })).ok && (parseSignupForm(form({ ...good, interval: 'YEARLY' })) as { ok: true; value: { interval: string } }).value.interval, 'YEARLY')
})

test('sign-up form: every mistake gets its own message and nothing slips through', () => {
  const bad: [Record<string, string>, RegExp][] = [
    [{ ownerName: '' }, /full name/], [{ ownerName: 'A' }, /full name/], [{ ownerName: 'Ali<script>' }, /full name/], [{ ownerName: '12345' }, /full name/],
    [{ email: 'nope' }, /email/], [{ email: 'a@b' }, /email/], [{ email: 'a'.repeat(250) + '@x.pk' }, /email/],
    [{ phone: '12345' }, /mobile/], [{ phone: '0211234567' }, /mobile/],
    [{ storeName: 'x' }, /store name/], [{ storeName: 'a'.repeat(51) }, /store name/], [{ storeName: '<b>x</b>' }, /store name/],
    [{ slug: 'ab' }, /3 to 30/], [{ slug: 'admin' }, /reserved/], [{ slug: 'Bad Slug' }, /lowercase/],
    [{ planId: '' }, /plan/], [{ planId: "x'; drop table" }, /plan/],
    [{ password: 'short' }, /12 characters/], [{ password: 'aaaaaaaaaaaaaaaa' }, /repetitive/], [{ email: 'alisha@example.pk', password: 'alisha-is-my-name-1' }, /email/],
    [{ terms: '' }, /Terms/],
  ]
  for (const [patch, re] of bad) {
    const r = parseSignupForm(form({ ...good, ...patch }))
    assert.equal(r.ok, false, JSON.stringify(patch))
    if (!r.ok) assert.match(r.error, re, JSON.stringify(patch))
  }
})

test('sign-up form: a filled honeypot is refused without saying why', () => {
  const r = parseSignupForm(form({ ...good, website: 'http://spam.example' }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'We could not process this request.')
})

// ------------------------------------------------------------------- tokens
test('verify tokens: round trip, only the hash is kept, junk is refused', () => {
  const { token, hash } = newVerifyToken('sr0123456789abcdef')
  const parts = splitVerifyToken(token)
  assert.ok(parts)
  assert.equal(parts!.id, 'sr0123456789abcdef')
  assert.equal(hashToken(parts!.secret), hash)
  assert.notEqual(hash, parts!.secret)
  assert.notEqual(newVerifyToken('sr0123456789abcdef').token, token) // never repeats
  for (const bad of ['', 'abc', 'a.b', `${token}x.`, 'x'.repeat(300), '../../etc.passwd', `sr0123456789abcdef.${'a'.repeat(31)}`, null as never]) assert.equal(splitVerifyToken(bad), null, String(bad))
})

test('dates: requests expire in 24 hours, trials in the chosen days', () => {
  const now = new Date(Date.UTC(2026, 10, 4, 12))
  assert.equal(requestExpiry(now).getTime() - now.getTime(), 24 * 3_600_000)
  assert.equal(trialEnd(now, 14).getTime() - now.getTime(), 14 * 86_400_000)
})

// -------------------------------------------------------------- gatekeeping
test('sign-up gate: closed switch and daily cap', () => {
  assert.equal(signupGate({ signupsOpen: true, dailyCap: 5 }, 4).ok, true)
  const closed = signupGate({ signupsOpen: false, dailyCap: 5 }, 0)
  assert.equal(!closed.ok && /closed/.test(closed.error), true)
  const full = signupGate({ signupsOpen: true, dailyCap: 5 }, 5)
  assert.equal(!full.ok && /tomorrow/.test(full.error), true)
})

test('approval is forced when email cannot be checked', () => {
  assert.equal(needsApproval(true, false), false)
  assert.equal(needsApproval(true, true), true)
  assert.equal(needsApproval(false, false), true)
  assert.equal(needsApproval(false, true), true)
})

// ----------------------------------------------------------------- settings
test('settings: safe defaults (closed) and defensive reading', () => {
  assert.equal(DEFAULT_SETTINGS.signupsOpen, false)
  assert.deepEqual(readSettings(null), DEFAULT_SETTINGS)
  assert.deepEqual(readSettings('garbage'), DEFAULT_SETTINGS)
  const s = readSettings({ signupsOpen: 'yes', trialDays: 999, dailyCap: -1, brandName: '', announcement: 5 })
  assert.equal(s.signupsOpen, false) // only a real true counts
  assert.equal(s.trialDays, 14)
  assert.equal(s.dailyCap, 20)
  assert.equal(s.brandName, 'Rooharka')
  assert.equal(readSettings({ signupsOpen: true, trialDays: 7 }).trialDays, 7)
})

test('settings form: limits and messages', () => {
  const ok = { brandName: 'Rooharka', trialDays: '14', dailyCap: '20', supportEmail: 'hi@x.pk', supportWhatsapp: '0300 1234567', signupsOpen: 'on' }
  const r = parseSettingsForm(form(ok))
  assert.ok(r.ok)
  if (r.ok) { assert.equal(r.value.signupsOpen, true); assert.equal(r.value.requireApproval, false); assert.equal(r.value.supportWhatsapp, '+923001234567') }
  const bad: [Record<string, string>, RegExp][] = [
    [{ trialDays: '-1' }, /Trial days/], [{ trialDays: '91' }, /Trial days/], [{ trialDays: '1e2' }, /Trial days/], [{ trialDays: '' }, /Trial days/],
    [{ dailyCap: '0' }, /daily/], [{ dailyCap: '1001' }, /daily/], [{ brandName: 'x' }, /brand/], [{ supportEmail: 'nope' }, /email/], [{ supportWhatsapp: '123' }, /WhatsApp/],
    [{ announcement: 'a'.repeat(161) }, /announcement/], [{ paymentInstructions: 'a'.repeat(1001) }, /payment/],
  ]
  for (const [patch, re] of bad) { const x = parseSettingsForm(form({ ...ok, ...patch })); assert.equal(x.ok, false, JSON.stringify(patch)); if (!x.ok) assert.match(x.error, re) }
  assert.equal(parseSettingsForm(form({ ...ok, trialDays: '0' })).ok, true)
})

// ------------------------------------------------------------ platform host
test('platform host: only configured addresses are the platform', () => {
  assert.deepEqual(platformHosts('Rooharka.pk, www.other.com:443 ,'), ['rooharka.pk', 'www.other.com'])
  assert.deepEqual(platformHosts(undefined), [])
  assert.equal(isPlatformHost('rooharka.pk', 'rooharka.pk'), true)
  assert.equal(isPlatformHost('www.rooharka.pk', 'rooharka.pk'), true)
  assert.equal(isPlatformHost('shop.rooharka.pk', 'rooharka.pk'), false)
  assert.equal(isPlatformHost('evil-rooharka.pk', 'rooharka.pk'), false)
  assert.equal(isPlatformHost('rooharka.pk', undefined), false)
  assert.equal(isPlatformHost(null, 'rooharka.pk'), false)
})

test('the public site shows on the platform address, or anywhere in development when none is set, never on a shop address in production', () => {
  assert.equal(marketingAllowed('rooharka.pk', 'rooharka.pk', false), true)
  assert.equal(marketingAllowed('darwaish.pk', 'rooharka.pk', false), false)
  assert.equal(marketingAllowed('localhost', 'rooharka.pk', true), false) // configured: respect it even in dev
  assert.equal(marketingAllowed('localhost', undefined, true), true)
  assert.equal(marketingAllowed('darwaish.pk', undefined, false), false) // production, nothing configured: hidden
})

test('free store addresses: exactly one label under the platform address', () => {
  assert.equal(subdomainOf('ali-store.rooharka.pk', 'rooharka.pk'), 'ali-store')
  for (const h of ['rooharka.pk', 'www.rooharka.pk', 'a.b.rooharka.pk', 'ali.other.pk', '.rooharka.pk', null]) assert.equal(subdomainOf(h, 'rooharka.pk'), null, String(h))
  assert.equal(subdomainOf('ali.rooharka.pk', undefined), null)
  assert.equal(storeAddress('ali', 'rooharka.pk'), 'https://ali.rooharka.pk')
  assert.equal(storeAddress('ali', undefined), null)
  assert.equal(platformOrigin(null, 'rooharka.pk'), 'https://rooharka.pk')
  assert.equal(platformOrigin('localhost:3000', undefined), 'http://localhost:3000')
  assert.equal(platformOrigin('app.example.com', undefined), 'https://app.example.com')
})

// --------------------------------------------------------------------- mail
test('mail: configured only with both settings; sending is safe', async () => {
  assert.equal(mailConfigured({}), false)
  assert.equal(mailConfigured({ RESEND_API_KEY: 'key_1234567890' }), false)
  assert.equal(mailConfigured({ RESEND_API_KEY: 'key_1234567890', MAIL_FROM: 'A <a@b.pk>' }), true)
  const env = { RESEND_API_KEY: 'key_SECRET_123456', MAIL_FROM: 'A <a@b.pk>' }
  const mail = verifyEmailMail({ brand: 'B', name: 'Ali', link: 'https://x.pk/v?t=1', hours: 24, to: 'ali@x.pk' })
  const seen: { url: string; auth: string; body: Record<string, unknown> }[] = []
  const ok = (async (url: string, init: RequestInit) => { seen.push({ url, auth: String((init.headers as Record<string, string>).Authorization), body: JSON.parse(String(init.body)) }); return new Response(JSON.stringify({ id: 'e1' }), { status: 200 }) }) as unknown as typeof fetch
  assert.deepEqual(await sendMail(mail, ok, env), { ok: true })
  assert.equal(seen[0].url, 'https://api.resend.com/emails')
  assert.equal(seen[0].auth, 'Bearer key_SECRET_123456')
  assert.deepEqual(seen[0].body.to, ['ali@x.pk'])
  const refused = await sendMail(mail, (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch, env)
  assert.equal(!refused.ok && /refused/.test(refused.error), true)
  const weird = await sendMail(mail, (async () => new Response('not json', { status: 200 })) as unknown as typeof fetch, env)
  assert.equal(weird.ok, false)
  const down = await sendMail(mail, (async () => { throw new Error('boom key_SECRET_123456') }) as unknown as typeof fetch, env)
  assert.equal(!down.ok && !down.error.includes('SECRET'), true) // the key never leaks
  assert.equal((await sendMail({ ...mail, to: 'a@b.pk, c@d.pk' }, ok, env)).ok, false) // no header-injection style recipients
  assert.equal((await sendMail(mail, ok, {})).ok, false)
})

test('email templates escape what people typed', () => {
  assert.equal(escapeHtml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;')
  const evil = '<img src=x onerror=alert(1)>'
  for (const m of [verifyEmailMail({ brand: evil, name: evil, link: 'https://x.pk', hours: 24, to: 'a@b.pk' }), alreadyRegisteredMail({ brand: evil, to: 'a@b.pk', loginUrl: 'https://x.pk' }),
    approvedMail({ brand: evil, name: evil, to: 'a@b.pk', loginUrl: 'https://x.pk', shopUrl: evil }), rejectedMail({ brand: evil, name: evil, to: 'a@b.pk', reason: evil, contact: evil })]) {
    assert.ok(!m.html.includes('<img'), m.subject)
  }
})

// ---------------------------------------------------- billing and lifecycle pieces
import { effectiveInvoiceStatus, intervalOf, periodPrice } from '@/lib/csmi/rules'
import { describePlan, yearlySaving } from '@/lib/signup/plans'

test('plan card text: limits, unlimited, features and saving', () => {
  const d = describePlan({ limits: { products: 100, staff: 1, tagline: 'For new shops', popular: true }, features: ['postex', 'nonsense', 'sms-otp'] })
  assert.deepEqual(d.bullets.slice(0, 3), ['Up to 100 products', 'Unlimited orders', '1 staff login'])
  assert.ok(d.bullets.includes('PostEx booking and tracking') && d.bullets.includes('Fake-order check by SMS code'))
  assert.ok(!d.bullets.some((b) => /nonsense/.test(b)))
  assert.equal(d.popular, true)
  assert.equal(describePlan({ limits: null, features: 'oops' }).bullets[0], 'Unlimited products')
  assert.equal(yearlySaving(3000, 30000), 17)
  assert.equal(yearlySaving(3000, 36000), null)
  assert.equal(yearlySaving(3000, null), null)
})

test('a store that chose yearly is billed yearly after the trial; overdue is shown as soon as the date passes', () => {
  const start = new Date(Date.UTC(2026, 10, 20)), end = new Date(Date.UTC(2027, 10, 20))
  assert.equal(intervalOf(start, end), 'YEARLY')
  assert.equal(periodPrice({ monthlyPrice: 3000, yearlyPrice: 30000 }, 'YEARLY', null), 30000)
  assert.equal(effectiveInvoiceStatus('OPEN', new Date(Date.UTC(2026, 10, 1)), new Date(Date.UTC(2026, 10, 2))), 'OVERDUE')
  assert.equal(effectiveInvoiceStatus('PAID', new Date(Date.UTC(2026, 10, 1)), new Date(Date.UTC(2026, 10, 2))), 'PAID')
})
