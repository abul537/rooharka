import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CourierError, NORMALIZED_STATUSES, STATUS_TEXT, STORED_STATUS, type CourierAdapter, type ShipmentOrder } from '@/lib/couriers/contract'
import { normalizePostexStatus, postexAdapter } from '@/lib/couriers/postex'
import { CONTRACT_COURIERS, getCourierAdapter } from '@/lib/couriers/factory'
import { bookOnce, type BookingLedger, type Claim } from '@/lib/couriers/idempotent'
import { openToken, sealToken, webhookKey } from '@/lib/couriers/vault-rules'
import { MAX_WEBHOOK_BYTES, extractKey, isPlausibleTenantId, keysMatch } from '@/lib/couriers/webhook-rules'
import { parseToken } from '@/lib/couriers/connect-rules'
import { toShipmentOrder } from '@/lib/couriers/shipment-order'
import { mapCourierStatus } from '@/lib/couriers/status'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const F = (fn: (url: string, init: RequestInit) => Response | Promise<Response>) => fn as unknown as typeof fetch
const order: ShipmentOrder = { reference: '1001', customer: { name: 'Ali Raza', email: '', phone: '03001234567', address: 'House 5, Gulberg', city: 'Lahore' }, codAmount: 2499.6, itemCount: 2, itemsSummary: 'Oil 50ml x2' }
const creds = { token: 'SECRET-TOKEN-123' }

// ------------------------------------------------------------------ the one status vocabulary
test('vocabulary: six statuses, each with a stored value and our own wording that reads back as the same stage', () => {
  assert.deepEqual([...NORMALIZED_STATUSES], ['label_created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'exception'])
  for (const s of NORMALIZED_STATUSES) {
    assert.ok(STORED_STATUS[s] && STATUS_TEXT[s])
    assert.equal(mapCourierStatus(STATUS_TEXT[s]), STORED_STATUS[s], s) // old text-based code agrees with the new vocabulary
  }
})

test('PostEx wording is normalized; unknown wording is ignored, never passed through', () => {
  const cases: [string, string | null][] = [
    ['Unbooked', 'label_created'], ['Booked', 'label_created'], ['Picked By PostEx', 'picked_up'], ['PostEx WareHouse', 'in_transit'],
    ['Enroute', 'in_transit'], ['Out For Delivery', 'out_for_delivery'], ['Delivered', 'delivered'], ['  DELIVERED ', 'delivered'],
    ['Returned', 'exception'], ['Out For Return', 'exception'], ['Attempted', 'exception'], ['Delivery Under Review', 'exception'], ['Cancelled', 'exception'],
    ['Return delivered to shipper', 'exception'], ['something new', null], ['', null],
  ]
  for (const [raw, want] of cases) assert.equal(normalizePostexStatus(raw), want, raw)
  assert.equal(normalizePostexStatus(null), null)
})

// ------------------------------------------------------------------ PostEx adapter
test('createShipment: token only in the header, order reference as the key, COD rounded, tracking number returned', async () => {
  let seen: { url: string; init: RequestInit } | null = null
  const r = await postexAdapter.createShipment(order, creds, F((url, init) => { seen = { url, init }; return json({ statusCode: '200', dist: { trackingNumber: '24500012345' } }) }))
  assert.deepEqual(r, { trackingNumber: '24500012345', shipmentId: '24500012345' })
  const body = JSON.parse(String(seen!.init.body))
  assert.equal((seen!.init.headers as Record<string, string>).token, 'SECRET-TOKEN-123')
  assert.equal(String(seen!.init.body).includes('SECRET-TOKEN-123'), false, 'token never in the body')
  assert.equal(seen!.url.includes('SECRET-TOKEN-123'), false, 'token never in the URL')
  assert.equal(body.orderRefNumber, '1001')
  assert.equal(body.invoicePayment, '2500')
  assert.equal('pickupAddressCode' in body, false)
})

test('createShipment failures: refused = nothing created, token rejected = auth, timeout / 5xx = outcome UNKNOWN', async () => {
  const kind = async (f: typeof fetch) => { try { await postexAdapter.createShipment(order, creds, f); return 'ok' } catch (e) { assert.ok(e instanceof CourierError); return (e as CourierError).kind } }
  assert.equal(await kind(F(() => json({ statusCode: '400', statusMessage: 'Invalid city' }))), 'rejected')
  assert.equal(await kind(F(() => json({}, 401))), 'auth')
  assert.equal(await kind(F(() => json({}, 403))), 'auth')
  assert.equal(await kind(F(() => { throw new Error('timeout') })), 'unknown')
  assert.equal(await kind(F(() => new Response('bad gateway', { status: 502 }))), 'unknown')
  assert.equal(await kind(F(() => new Response('<html>', { status: 200 }))), 'rejected')
  for (const dist of [{}, { trackingNumber: '' }, { trackingNumber: 'x' }, { trackingNumber: '<script>' }]) assert.equal(await kind(F(() => json({ statusCode: '200', dist }))), 'rejected', JSON.stringify(dist))
})

test('error messages never contain the token or an endpoint', async () => {
  for (const f of [F(() => json({}, 401)), F(() => { throw new Error('boom SECRET-TOKEN-123 https://api.postex.pk') }), F(() => json({ statusCode: '400', statusMessage: 'Bad' }))]) {
    try { await postexAdapter.createShipment(order, creds, f) } catch (e) { assert.doesNotMatch((e as Error).message, /SECRET|https?:|api\.postex|\/v3/) }
  }
})

test('track: normalized, oldest first, our wording, unknown statuses dropped, current status always present', async () => {
  const body = { statusCode: '200', dist: { transactionStatus: 'Delivered', transactionStatusHistory: [
    { transactionStatusMessage: 'Out For Delivery', updatedAt: '2026-11-03T10:00:00Z' },
    { transactionStatusMessage: 'Booked', updatedAt: '2026-11-01T09:00:00Z' },
    { transactionStatusMessage: 'Some Brand New Thing', updatedAt: '2026-11-02T09:00:00Z' },
  ] } }
  const ev = await postexAdapter.track('24500012345', creds, F(() => json(body)))
  assert.deepEqual(ev.map((e) => e.status), ['label_created', 'out_for_delivery', 'delivered'])
  assert.equal(ev[1].description, STATUS_TEXT.out_for_delivery)
  assert.ok(ev.every((e) => !/Some Brand|Unbooked/.test(e.description)))
  await assert.rejects(postexAdapter.track('x1234', creds, F(() => json({}, 401))), (e: CourierError) => e.kind === 'auth')
  await assert.rejects(postexAdapter.track('x1234', creds, F(() => json({ statusCode: '404' }))), (e: CourierError) => e.kind === 'rejected')
})

test('track: the tracking number is URL-encoded', async () => {
  const urls: string[] = []
  await postexAdapter.track('TN 12/3', creds, F((u) => { urls.push(u); return json({ statusCode: '200', dist: {} }) }))
  assert.ok(urls[0].endsWith('/v1/track-order/TN%2012%2F3'))
})

test('cancelShipment and verifyCredentials', async () => {
  let seen: { url: string; init: RequestInit } | null = null
  await postexAdapter.cancelShipment('24500012345', creds, F((url, init) => { seen = { url, init }; return json({ statusCode: '200' }) }))
  assert.equal(seen!.init.method, 'PUT')
  assert.equal(JSON.parse(String(seen!.init.body)).trackingNumber, '24500012345')
  await assert.rejects(postexAdapter.cancelShipment('24500012345', creds, F(() => json({ statusCode: '400', statusMessage: 'Already picked up' }))), (e: CourierError) => e.kind === 'rejected' && /picked up/.test(e.message))
  await postexAdapter.verifyCredentials(creds, F(() => json({ statusCode: '200', dist: [] })))
  await assert.rejects(postexAdapter.verifyCredentials(creds, F(() => json({}, 403))), (e: CourierError) => e.kind === 'auth')
  await assert.rejects(postexAdapter.verifyCredentials(creds, F(() => { throw new Error('down') })), (e: CourierError) => e.kind === 'unreachable')
  await assert.rejects(postexAdapter.verifyCredentials(creds, F(() => new Response('<html>502</html>', { status: 502 }))), (e: CourierError) => e.kind === 'unreachable')
})

test('parseWebhook: understands the usual shapes, ignores everything else', () => {
  const a = postexAdapter.parseWebhook({ trackingNumber: '24500012345', transactionStatus: 'Out For Delivery', updatedAt: '2026-11-03T10:00:00Z' })!
  assert.equal(a.trackingNumber, '24500012345'); assert.equal(a.event.status, 'out_for_delivery'); assert.equal(a.event.description, STATUS_TEXT.out_for_delivery)
  assert.equal(postexAdapter.parseWebhook({ data: { cn: '24500012345', status: 'Delivered' } })!.event.status, 'delivered')
  assert.equal(postexAdapter.parseWebhook({ trackingNumber: '24500012345', transactionStatus: 'Weird' }), null)
  assert.equal(postexAdapter.parseWebhook({ transactionStatus: 'Delivered' }), null)
  assert.equal(postexAdapter.parseWebhook({ trackingNumber: '<x>', transactionStatus: 'Delivered' }), null)
  assert.equal(postexAdapter.parseWebhook(null), null)
  assert.equal(postexAdapter.parseWebhook('hello'), null)
})

// ------------------------------------------------------------------ factory
test('factory: resolves by name; unknown couriers are refused politely', () => {
  assert.equal(getCourierAdapter('postex').provider, 'postex')
  assert.deepEqual([...CONTRACT_COURIERS], ['postex'])
  assert.throws(() => getCourierAdapter('tcs'), (e: CourierError) => e.kind === 'unsupported')
})

// ------------------------------------------------------------------ idempotency
/** An in-memory stand-in for the database ledger, with the same rules as the real one. */
function fakeLedger(preset?: { tracking?: string | null }) {
  const st = { rows: preset ? [{ id: 'r0', tracking: preset.tracking ?? null }] : [] as { id: string; tracking: string | null; note?: string }[], n: 0 }
  const ledger: BookingLedger = {
    async claim(): Promise<Claim> {
      const done = st.rows.find((r) => r.tracking)
      if (done) return { kind: 'existing', trackingNumber: done.tracking! }
      if (st.rows.length) return { kind: 'pending' }
      const id = `r${++st.n}`; st.rows.push({ id, tracking: null }); return { kind: 'claimed', claimId: id }
    },
    async complete(id, tn) { st.rows.find((r) => r.id === id)!.tracking = tn },
    async release(id) { st.rows = st.rows.filter((r) => r.id !== id) },
    async flagUnknown(id, msg) { st.rows.find((r) => r.id === id)!.note = msg },
  }
  return { ledger, st }
}
const countingAdapter = (behaviour: (n: number) => Promise<{ trackingNumber: string; shipmentId: string }>) => {
  const a = { calls: 0, adapter: { provider: 'postex', async createShipment() { return behaviour(++a.calls) } } as unknown as CourierAdapter }
  return a
}

test('idempotency: an order that already has a tracking number is NOT sent to the courier again', async () => {
  const { ledger } = fakeLedger({ tracking: '24500012345' })
  const a = countingAdapter(async () => ({ trackingNumber: 'NEW1234', shipmentId: 'NEW1234' }))
  const r = await bookOnce(ledger, a.adapter, order, creds)
  assert.deepEqual(r, { status: 'existing', trackingNumber: '24500012345' })
  assert.equal(a.calls, 0)
})

test('idempotency: booking twice (double click, parallel retry) creates ONE parcel', async () => {
  const { ledger, st } = fakeLedger()
  const a = countingAdapter(async () => ({ trackingNumber: '24500012345', shipmentId: '24500012345' }))
  const first = await bookOnce(ledger, a.adapter, order, creds)
  const second = await bookOnce(ledger, a.adapter, order, creds)
  assert.equal(first.status, 'booked'); assert.deepEqual(second, { status: 'existing', trackingNumber: '24500012345' })
  assert.equal(a.calls, 1); assert.equal(st.rows.length, 1)
})

test('idempotency: a TIMEOUT followed by a retry never books a second parcel', async () => {
  const { ledger, st } = fakeLedger()
  const a = countingAdapter(async (n) => { if (n === 1) throw new CourierError('unknown', 'PostEx did not answer in time.'); return { trackingNumber: 'DOUBLE-1', shipmentId: 'DOUBLE-1' } })
  const first = await bookOnce(ledger, a.adapter, order, creds)
  assert.equal(first.status, 'failed')
  for (let i = 0; i < 3; i++) assert.deepEqual(await bookOnce(ledger, a.adapter, order, creds), { status: 'pending' })
  assert.equal(a.calls, 1, 'the courier was asked exactly once')
  assert.equal(st.rows.length, 1)
  assert.match(st.rows[0].note ?? '', /did not answer/)
})

test('idempotency: when the courier clearly REFUSED, nothing exists, so a retry is allowed and succeeds once', async () => {
  const { ledger, st } = fakeLedger()
  const a = countingAdapter(async (n) => { if (n === 1) throw new CourierError('rejected', 'Invalid city'); return { trackingNumber: '24500099999', shipmentId: '24500099999' } })
  const first = await bookOnce(ledger, a.adapter, order, creds)
  assert.deepEqual(first, { status: 'failed', kind: 'rejected', message: 'Invalid city' })
  assert.equal(st.rows.length, 0, 'claim released')
  assert.equal((await bookOnce(ledger, a.adapter, order, creds)).status, 'booked')
  assert.equal((await bookOnce(ledger, a.adapter, order, creds)).status, 'existing')
  assert.equal(a.calls, 2)
})

test('idempotency: booked at the courier but saving failed -> the claim stays, the number is kept, no second booking', async () => {
  const { ledger, st } = fakeLedger()
  const real = ledger.complete
  ledger.complete = async () => { throw new Error('db down') }
  const a = countingAdapter(async () => ({ trackingNumber: '24500012345', shipmentId: '24500012345' }))
  const r = await bookOnce(ledger, a.adapter, order, creds)
  assert.equal(r.status, 'failed'); assert.match(st.rows[0].note ?? '', /24500012345/)
  ledger.complete = real
  assert.deepEqual(await bookOnce(ledger, a.adapter, order, creds), { status: 'pending' })
  assert.equal(a.calls, 1)
})

test('idempotency: an order with another courier is skipped, not double-shipped', async () => {
  const a = countingAdapter(async () => ({ trackingNumber: 'X1234', shipmentId: 'X1234' }))
  const r = await bookOnce({ ...fakeLedger().ledger, claim: async () => ({ kind: 'skipped', reason: 'other courier' }) }, a.adapter, order, creds)
  assert.deepEqual(r, { status: 'skipped', reason: 'other courier' }); assert.equal(a.calls, 0)
})

// ------------------------------------------------------------------ vault
test('vault: the token is encrypted, bound to its store and courier, and unreadable if tampered', () => {
  const sealed = sealToken('store_AAAAAAAAAA', 'postex', 'SECRET-TOKEN-123')
  assert.equal(sealed.includes('SECRET-TOKEN-123'), false)
  assert.equal(Buffer.from(sealed.slice(3), 'base64url').toString('utf8').includes('SECRET'), false)
  assert.notEqual(sealToken('store_AAAAAAAAAA', 'postex', 'SECRET-TOKEN-123'), sealed, 'fresh random IV each time')
  assert.equal(openToken('store_AAAAAAAAAA', 'postex', sealed), 'SECRET-TOKEN-123')
  assert.equal(openToken('store_BBBBBBBBBB', 'postex', sealed), null, 'a copied row is useless for another store')
  assert.equal(openToken('store_AAAAAAAAAA', 'tcs', sealed), null)
  assert.equal(openToken('store_AAAAAAAAAA', 'postex', sealed.slice(0, -3) + 'AAA'), null)
  assert.equal(openToken('store_AAAAAAAAAA', 'postex', 'garbage'), null)
})

// ------------------------------------------------------------------ webhook rules
test('webhook key: one per store and courier, constant-time check, found in URL or header', () => {
  const a = webhookKey('store_AAAAAAAAAA', 'postex'), b = webhookKey('store_BBBBBBBBBB', 'postex')
  assert.notEqual(a, b); assert.equal(a, webhookKey('store_AAAAAAAAAA', 'postex')); assert.ok(a.length >= 32)
  assert.ok(keysMatch(a, a)); assert.ok(!keysMatch(b, a), "store B's key does not open store A")
  assert.ok(!keysMatch('', a)); assert.ok(!keysMatch(null, a)); assert.ok(!keysMatch(a.slice(1), a))
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null })
  assert.equal(extractKey(`https://x.pk/api/webhooks/postex/t?key=${a}`, h({})), a)
  assert.equal(extractKey('https://x.pk/api/webhooks/postex/t', h({ 'x-webhook-key': a })), a)
  assert.equal(extractKey('https://x.pk/api/webhooks/postex/t', h({ authorization: `Bearer ${a}` })), a)
  assert.equal(extractKey('https://x.pk/api/webhooks/postex/t', h({})), null)
  assert.ok(isPlausibleTenantId('cmabc123def456ghi789')); assert.ok(!isPlausibleTenantId('../etc')); assert.ok(!isPlausibleTenantId('a'))
  assert.ok(MAX_WEBHOOK_BYTES <= 100_000)
})

// ------------------------------------------------------------------ connect screen + order mapping
test('connect: pasted tokens are trimmed; empty or malformed ones get the friendly message', () => {
  assert.deepEqual(parseToken('  abcd1234efgh \n'), { ok: true, token: 'abcd1234efgh' })
  for (const bad of ['', '   ', 'short', 'has space inside1', 'x'.repeat(601), 'tökén-with-ünicode', null, 42]) {
    const r = parseToken(bad)
    assert.equal(r.ok, false, String(bad)); if (!r.ok) assert.doesNotMatch(r.error, /json|endpoint|api\//i)
  }
})

test('toShipmentOrder: reference = order number, +92 -> 03, COD = total minus paid, measured lines count once', () => {
  const o = toShipmentOrder({
    id: 'o1', storeId: 's1', number: '1001', total: { toNumber: () => 3000 }, amountPaid: { toNumber: () => 500 }, customerName: 'Ali', customerEmail: null, customerPhone: '+923001234567',
    cityName: 'Lahore', landmark: 'House 5', localityName: 'Gulberg',
    items: [{ name: 'Oil', variantLabel: '50ml', quantity: 2, unitCode: null }, { name: 'Rice', variantLabel: null, quantity: 1500, unitCode: 'g' }],
  })
  assert.equal(o.reference, '1001'); assert.equal(o.customer.phone, '03001234567'); assert.equal(o.customer.address, 'House 5, Gulberg')
  assert.equal(o.codAmount, 2500); assert.equal(o.itemCount, 3)
})
