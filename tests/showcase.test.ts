import { test } from 'node:test'
import assert from 'node:assert/strict'
import { httpsUrl, parseClient, storeCountLine } from '@/lib/showcase/rules'

const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null })
const base = { name: 'Khaadi Home', permission: 'on', isVisible: 'on' }

test('only https addresses are accepted', () => {
  assert.equal(httpsUrl('https://example.com/logo.png'), 'https://example.com/logo.png')
  for (const bad of ['http://example.com', 'javascript:alert(1)', 'data:image/png;base64,xx', 'https://localhost', 'example.com', '']) assert.equal(httpsUrl(bad), null, bad)
})

test('client form: valid, and every refusal', () => {
  const ok = parseClient(form({ ...base, logoUrl: 'https://cdn.example.com/a.png', website: 'https://example.com', quote: 'Orders doubled.', person: 'Ayesha, owner', sortOrder: '3' }))
  assert.equal(ok.ok, true)
  if (ok.ok) { assert.equal(ok.value.sortOrder, 3); assert.equal(ok.value.isVisible, true); assert.equal(ok.value.quote, 'Orders doubled.') }
  const bad = (o: Record<string, string>) => parseClient(form({ ...base, ...o })).ok
  assert.equal(bad({}), true)
  assert.equal(bad({ name: 'X' }), false)
  assert.equal(bad({ name: '<b>x</b>' }), false)
  assert.equal(bad({ logoUrl: 'http://example.com/a.png' }), false)
  assert.equal(bad({ website: 'javascript:alert(1)' }), false)
  assert.equal(bad({ quote: 'Great' }), false) // a testimonial needs a person
  assert.equal(bad({ quote: 'x'.repeat(241), person: 'A' }), false)
  assert.equal(bad({ sortOrder: '-1' }), false)
  assert.equal(parseClient(form({ name: 'Khaadi Home' })).ok, false) // permission box is required
})

test('a person without a quote is dropped, not shown alone', () => {
  const r = parseClient(form({ ...base, person: 'Ayesha' }))
  assert.equal(r.ok && r.value.person, null)
})

test('store count line is honest', () => {
  assert.equal(storeCountLine(0, 'Rooharka'), null)
  assert.equal(storeCountLine(-3, 'Rooharka'), null)
  assert.equal(storeCountLine(1, 'Rooharka'), '1 store runs on Rooharka')
  assert.equal(storeCountLine(1200, 'Rooharka'), '1,200 stores run on Rooharka')
})
