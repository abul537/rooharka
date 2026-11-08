import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseContact, telHref, whatsappHref } from '@/lib/contact/rules'

const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null })
const base = { name: 'Ayesha Khan', phone: '0300 1234567', message: 'Is this in stock in Lahore?' }

test('a valid message', () => {
  const r = parseContact(form({ ...base, email: 'a@b.com' }))
  assert.equal(r.ok, true)
  if (r.ok) { assert.equal(r.value.email, 'a@b.com'); assert.match(r.value.phone, /3001234567$/) }
  assert.equal(parseContact(form(base)).ok && true, true) // email is optional
})

test('every refusal', () => {
  const bad = (o: Record<string, string>) => parseContact(form({ ...base, ...o }))
  assert.equal(bad({ name: 'A' }).ok, false)
  assert.equal(bad({ name: '<b>x</b>' }).ok, false)
  assert.equal(bad({ phone: '123' }).ok, false)
  assert.equal(bad({ email: 'nope' }).ok, false)
  assert.equal(bad({ message: 'hi' }).ok, false)
  assert.equal(bad({ message: 'x'.repeat(1001) }).ok, false)
  assert.equal(bad({ message: 'see <script>' }).ok, false)
  assert.equal(bad({ message: 'http://a.com http://b.com http://c.com buy now' }).ok, false)
})

test('the hidden field catches bots silently', () => {
  const r = parseContact(form({ ...base, website: 'http://spam.com' }))
  assert.deepEqual(r, { ok: false, error: 'HONEYPOT' })
})

test('whatsapp and phone links', () => {
  assert.match(whatsappHref('03001234567', 'Hi there')!, /^https:\/\/wa\.me\/923001234567\?text=Hi%20there$/)
  assert.equal(whatsappHref(null), null); assert.equal(whatsappHref('abc'), null)
  assert.equal(telHref('03001234567'), 'tel:+923001234567')
  assert.equal(telHref(''), null)
})
