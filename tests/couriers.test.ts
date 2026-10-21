import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  courierName, courierOptions, DEFAULT_COURIER_CONFIG, parseCourierForm, readCourierConfig, trackingLink, validateTrackingTemplate,
} from '@/lib/couriers/config'
import { findLeopardsCity, leopardsAdapter, postexAdapter, type BookingInput } from '@/lib/couriers/adapters'

const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

// ------------------------------------------------------------------ config
test('a store that never configured couriers gets the built-in list', () => {
  const c = readCourierConfig({})
  assert.deepEqual(c.enabled, DEFAULT_COURIER_CONFIG.enabled)
  assert.deepEqual(readCourierConfig(null).custom, [])
  assert.deepEqual(readCourierConfig({ couriers: 'garbage' }).enabled, DEFAULT_COURIER_CONFIG.enabled)
})

test('saved config is sanitised: unknown keys and a disabled default are dropped', () => {
  const c = readCourierConfig({ couriers: { enabled: ['tcs', 'nonsense', 'c-trax'], default: 'postex', custom: [{ key: 'c-trax', name: 'Trax', trackingUrl: null }, { key: 'BAD KEY', name: 'x' }] } })
  assert.deepEqual(c.enabled, ['tcs', 'c-trax'])
  assert.equal(c.defaultKey, null) // postex is not enabled
  assert.equal(c.custom.length, 1)
})

test('parseCourierForm: needs at least one courier', () => {
  const r = parseCourierForm(form({}))
  assert.equal(r.ok, false)
})

test('parseCourierForm: built-ins, custom courier and default', () => {
  const r = parseCourierForm(form({
    'courier.tcs': 'on', 'courier.postex': 'on',
    customName0: 'Trax', customUrl0: 'https://trax.pk/track/{tn}',
    defaultCourier: 'postex',
  }))
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.deepEqual(r.value.enabled, ['tcs', 'postex', 'c-trax'])
  assert.equal(r.value.defaultKey, 'postex')
  assert.equal(r.value.custom[0].trackingUrl, 'https://trax.pk/track/{tn}')
})

test('parseCourierForm: a default that is not enabled is ignored', () => {
  const r = parseCourierForm(form({ 'courier.tcs': 'on', defaultCourier: 'leopards' }))
  assert.equal(r.ok && r.value.defaultKey, null)
})

test('parseCourierForm: keeps an existing custom key stable when renamed, and never trusts a bad one', () => {
  const kept = parseCourierForm(form({ 'courier.tcs': 'on', customKey0: 'c-trax', customName0: 'Trax Express' }))
  assert.equal(kept.ok && kept.value.custom[0].key, 'c-trax')
  const bad = parseCourierForm(form({ 'courier.tcs': 'on', customKey0: '../../etc', customName0: 'Trax' }))
  assert.equal(bad.ok && bad.value.custom[0].key, 'c-trax')
})

test('parseCourierForm: duplicate names (also of built-ins) are refused', () => {
  assert.equal(parseCourierForm(form({ 'courier.tcs': 'on', customName0: 'Trax', customName1: 'trax' })).ok, false)
  assert.equal(parseCourierForm(form({ 'courier.tcs': 'on', customName0: 'TCS' })).ok, false)
})

test('parseCourierForm: two custom couriers with the same slug get different keys', () => {
  const r = parseCourierForm(form({ 'courier.tcs': 'on', customName0: 'A-B', customName1: 'A B' }))
  assert.equal(r.ok, true)
  if (r.ok) assert.notEqual(r.value.custom[0].key, r.value.custom[1].key)
})

test('tracking link template rules', () => {
  assert.equal(validateTrackingTemplate('https://x.pk/t?n={tn}'), null)
  assert.ok(validateTrackingTemplate('https://x.pk/t?n=123'))            // no {tn}
  assert.ok(validateTrackingTemplate('http://x.pk/t?n={tn}'))             // not https
  assert.ok(validateTrackingTemplate('javascript:alert({tn})'))          // not a web link
  assert.ok(validateTrackingTemplate('https://u:p@x.pk/{tn}'))           // credentials
  assert.ok(validateTrackingTemplate(`https://x.pk/${'a'.repeat(400)}{tn}`)) // too long
})

test('trackingLink fills in the number safely', () => {
  const c = readCourierConfig({ couriers: { enabled: ['c-trax'], custom: [{ key: 'c-trax', name: 'Trax', trackingUrl: 'https://trax.pk/t?n={tn}' }] } })
  assert.equal(trackingLink(c, 'c-trax', 'AB-12'), 'https://trax.pk/t?n=AB-12')
  assert.equal(trackingLink(c, 'c-trax', 'a b&c'), 'https://trax.pk/t?n=a%20b%26c')
  assert.equal(trackingLink(c, 'tcs', 'AB-12'), null)
  assert.equal(trackingLink(c, 'c-trax', null), null)
})

test('courierOptions: only enabled couriers, default first, auto only when connected', () => {
  const c = readCourierConfig({ couriers: { enabled: ['tcs', 'postex', 'leopards'], default: 'postex', custom: [] } })
  const opts = courierOptions(c, new Set(['postex']))
  assert.deepEqual(opts.map((o) => o.key), ['postex', 'tcs', 'leopards'])
  assert.equal(opts[0].auto, true)
  assert.equal(opts.find((o) => o.key === 'leopards')!.auto, false) // not connected
  assert.equal(courierOptions(c, new Set(['tcs']))[1].auto, false)    // tcs has no automatic booking
})

test('courierName keeps old and unknown couriers readable', () => {
  const c = readCourierConfig({ couriers: { enabled: ['tcs'] } })
  assert.equal(courierName(c, 'postex'), 'PostEx')
  assert.equal(courierName(c, 'something-old'), 'something-old')
})

// ---------------------------------------------------------------- adapters
const input: BookingInput = {
  orderNumber: '1001', customerName: 'Ali Raza', email: '', phone: '03001234567', address: 'House 5, Gulberg', city: 'Lahore',
  codAmount: 2500, itemCount: 2, itemsSummary: 'Oil 50ml x2', shipper: { name: 'MPPMHK', phone: '03111111111', email: '' },
}

test('PostEx books: sends token and COD, returns the tracking number', async () => {
  let seen: { url: string; init: RequestInit } | null = null
  const f = (async (url: string, init: RequestInit) => { seen = { url, init }; return json({ statusCode: '200', statusMessage: 'ok', dist: { trackingNumber: '24500012345' } }) }) as unknown as typeof fetch
  const r = await postexAdapter.book(input, { apiToken: 'tok' }, { pickupAddressCode: '001' }, f)
  assert.deepEqual(r.ok && r.trackingNo, '24500012345')
  const body = JSON.parse(String(seen!.init.body))
  assert.equal(seen!.url.startsWith('https://'), true)
  assert.equal((seen!.init.headers as Record<string, string>).token, 'tok')
  assert.equal(body.invoicePayment, '2500')
  assert.equal(body.orderRefNumber, '1001')
  assert.equal(body.pickupAddressCode, '001')
})

test('PostEx: courier errors become readable messages and book nothing', async () => {
  const bad = (async () => json({ statusCode: '400', statusMessage: 'Invalid city' })) as unknown as typeof fetch
  const r = await postexAdapter.book(input, { apiToken: 't' }, { pickupAddressCode: '1' }, bad)
  assert.equal(r.ok, false)
  assert.match(!r.ok ? r.error : '', /Invalid city/)

  const unauthorised = (async () => json({}, 401)) as unknown as typeof fetch
  const u = await postexAdapter.book(input, { apiToken: 't' }, { pickupAddressCode: '1' }, unauthorised)
  assert.match(!u.ok ? u.error : '', /token/i)
})

test('PostEx: a "success" without a usable tracking number is NOT treated as booked', async () => {
  for (const dist of [{}, { trackingNumber: '' }, { trackingNumber: 'x' }, { trackingNumber: '<script>' }]) {
    const f = (async () => json({ statusCode: '200', dist })) as unknown as typeof fetch
    const r = await postexAdapter.book(input, { apiToken: 't' }, { pickupAddressCode: '1' }, f)
    assert.equal(r.ok, false, JSON.stringify(dist))
  }
})

test('network failure and unreadable replies are handled', async () => {
  const down = (async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch
  const a = await postexAdapter.book(input, { apiToken: 't' }, { pickupAddressCode: '1' }, down)
  assert.match(!a.ok ? a.error : '', /Nothing was booked/)
  const html = (async () => new Response('<html>502</html>', { status: 502 })) as unknown as typeof fetch
  const b = await postexAdapter.check({ apiToken: 't' }, {}, html)
  assert.equal(b.ok, false)
})

test('PostEx check: ok / rejected', async () => {
  const ok = (async () => json({ statusCode: '200', dist: [] })) as unknown as typeof fetch
  assert.equal((await postexAdapter.check({ apiToken: 't' }, {}, ok)).ok, true)
  const no = (async () => json({}, 403)) as unknown as typeof fetch
  assert.equal((await postexAdapter.check({ apiToken: 't' }, {}, no)).ok, false)
})

test('Leopards: city names are matched to Leopards ids, case-insensitively', () => {
  const list = [{ id: '1', name: 'Lahore' }, { id: '2', name: 'Karachi' }]
  assert.equal(findLeopardsCity(list, ' lahore '), '1')
  assert.equal(findLeopardsCity(list, 'Quetta'), null)
  assert.equal(findLeopardsCity('nope', 'Lahore'), null)
})

test('Leopards books with ids, form-encoded, COD amount and returns the track number', async () => {
  const calls: { url: string; body: string }[] = []
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: String(init.body) })
    return url.includes('getAllCities')
      ? json({ status: 1, city_list: [{ id: 789, name: 'Lahore' }, { id: 790, name: 'Multan' }] })
      : json({ status: 1, error: 0, track_number: 'LE123456789' })
  }) as unknown as typeof fetch
  const r = await leopardsAdapter.book({ ...input, city: 'Multan' }, { apiKey: 'k', apiPassword: 'p' }, { originCity: 'Lahore' }, f)
  assert.equal(r.ok && r.trackingNo, 'LE123456789')
  const p = new URLSearchParams(calls[1].body)
  assert.equal(p.get('origin_city'), '789')
  assert.equal(p.get('destination_city'), '790')
  assert.equal(p.get('net_total_amount'), '2500')
  assert.equal(p.get('order_id'), '1001')
})

test('Leopards: unknown destination city or bad login explains what to do', async () => {
  const noCity = (async () => json({ status: 1, city_list: [{ id: 1, name: 'Lahore' }] })) as unknown as typeof fetch
  const r = await leopardsAdapter.book({ ...input, city: 'Gwadar' }, { apiKey: 'k', apiPassword: 'p' }, { originCity: 'Lahore' }, noCity)
  assert.match(!r.ok ? r.error : '', /Gwadar/)
  const badLogin = (async () => json({ status: 0, error: 1 })) as unknown as typeof fetch
  const l = await leopardsAdapter.book(input, { apiKey: 'k', apiPassword: 'p' }, { originCity: 'Lahore' }, badLogin)
  assert.match(!l.ok ? l.error : '', /rejected/)
})
