import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkCronAuth, MIN_CRON_SECRET } from '@/lib/cron-auth'
import { jobHealth } from '@/lib/job-rules'
import { currentStatus, eventKey, isFinished, mapCourierStatus, orderTargetFor, parseCourierDate, shouldAdvance } from '@/lib/couriers/status'
import { parseLeopardsTrack, parsePostexTrack, postexAdapter, leopardsAdapter } from '@/lib/couriers/adapters'
import { parseCourierForm, readCourierConfig } from '@/lib/couriers/config'

// ------------------------------------------------------------- cron secret
const SECRET = 'a'.repeat(MIN_CRON_SECRET) + 'xyz'
test('cron auth: refuses everything when no (or a short) secret is configured', () => {
  assert.equal(checkCronAuth(`Bearer ${SECRET}`, undefined), 'unconfigured')
  assert.equal(checkCronAuth(`Bearer short`, 'short'), 'unconfigured')
  assert.equal(checkCronAuth(null, ''), 'unconfigured')
})
test('cron auth: only the exact bearer secret passes', () => {
  assert.equal(checkCronAuth(`Bearer ${SECRET}`, SECRET), 'ok')
  for (const bad of [null, undefined, '', SECRET, `bearer ${SECRET}`, `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(1)}`, 'Bearer ', 'Basic abc']) assert.equal(checkCronAuth(bad, SECRET), 'denied', String(bad))
})

// ------------------------------------------------------------- job health
const h = (n: number) => new Date(Date.UTC(2026, 10, 1, 12) - n * 3_600_000)
const run = (status: string, hoursAgo: number) => ({ status, startedAt: h(hoursAgo), finishedAt: status === 'RUNNING' ? null : h(hoursAgo) })
const NOW = new Date(Date.UTC(2026, 10, 1, 12))
test('job health: never, ok, late, failed, running', () => {
  assert.equal(jobHealth(null, null, 24, NOW), 'never')
  assert.equal(jobHealth(run('OK', 5), run('OK', 5), 24, NOW), 'ok')
  assert.equal(jobHealth(run('OK', 40), run('OK', 40), 24, NOW), 'late') // older than 1.5 days
  assert.equal(jobHealth(run('FAILED', 1), run('OK', 30), 24, NOW), 'failed')
  assert.equal(jobHealth(run('RUNNING', 0.05), run('OK', 20), 24, NOW), 'running')
  assert.equal(jobHealth(run('RUNNING', 3), run('OK', 20), 24, NOW), 'ok') // a stuck "running" row is ignored; last good run counts
  assert.equal(jobHealth(run('RUNNING', 3), null, 24, NOW), 'late')
})

// ------------------------------------------------------- courier wording
test('courier wording maps to our statuses', () => {
  const cases: [string, string | null][] = [
    ['Delivered', 'DELIVERED'], ['SHIPMENT DELIVERED', 'DELIVERED'], ['Out For Delivery', 'OUT_FOR_DELIVERY'], ['with delivery rider', 'OUT_FOR_DELIVERY'],
    ['Returned', 'RETURNED'], ['Return delivered to shipper', 'RETURNED'], ['RTO initiated', 'RETURNED'], ['Returning to shipper', 'RETURNED'],
    ['Undelivered - consignee not available', 'FAILED'], ['Delivery attempt failed', 'FAILED'], ['Refused by customer', 'FAILED'],
    ['Arrived at Lahore hub', 'IN_TRANSIT'], ['In Transit', 'IN_TRANSIT'], ['En-Route to Karachi warehouse', 'IN_TRANSIT'], ['Dispatched', 'IN_TRANSIT'],
    ['Picked up from shipper', 'PICKED_UP'], ['Unbooked', 'CREATED'], ['Pending', 'CREATED'], ['Booked', 'CREATED'],
    ['', null], ['   ', null], ['gibberish nobody knows', null],
  ]
  for (const [text, want] of cases) assert.equal(mapCourierStatus(text), want, text)
  assert.equal(mapCourierStatus(null), null)
  assert.equal(mapCourierStatus(undefined), null)
})

test('a parcel status only moves forward and never after it is finished', () => {
  assert.equal(shouldAdvance('CREATED', 'IN_TRANSIT'), true)
  assert.equal(shouldAdvance('IN_TRANSIT', 'OUT_FOR_DELIVERY'), true)
  assert.equal(shouldAdvance('OUT_FOR_DELIVERY', 'FAILED'), true) // a failed attempt is news
  assert.equal(shouldAdvance('FAILED', 'OUT_FOR_DELIVERY'), true) // and so is the next attempt
  assert.equal(shouldAdvance('OUT_FOR_DELIVERY', 'IN_TRANSIT'), false) // never backwards
  assert.equal(shouldAdvance('IN_TRANSIT', 'IN_TRANSIT'), false)
  assert.equal(shouldAdvance('FAILED', 'RETURNED'), true)
  for (const done of ['DELIVERED', 'RETURNED'] as const) { assert.equal(isFinished(done), true); for (const next of ['CREATED', 'IN_TRANSIT', 'DELIVERED', 'RETURNED'] as const) assert.equal(shouldAdvance(done, next), false) }
})

test('the order follows the parcel only along allowed steps', () => {
  assert.equal(orderTargetFor('DELIVERED', 'SHIPPED'), 'DELIVERED')
  assert.equal(orderTargetFor('DELIVERED', 'OUT_FOR_DELIVERY'), 'DELIVERED')
  assert.equal(orderTargetFor('OUT_FOR_DELIVERY', 'SHIPPED'), 'OUT_FOR_DELIVERY')
  assert.equal(orderTargetFor('RETURNED', 'SHIPPED'), 'RETURNED')
  assert.equal(orderTargetFor('OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'), null) // already there
  assert.equal(orderTargetFor('IN_TRANSIT', 'SHIPPED'), null) // no order step for that
  assert.equal(orderTargetFor('FAILED', 'SHIPPED'), null)
  for (const owner of ['PLACED', 'CONFIRMED', 'PACKED', 'DELIVERED', 'CANCELLED', 'RETURNED'] as const) assert.equal(orderTargetFor('DELIVERED', owner), null, owner) // never touch what the owner finished
})

test('current status: the courier\'s own words win, else the newest recognised event', () => {
  const ev = (status: 'IN_TRANSIT' | 'DELIVERED' | null, hour: number) => ({ status, text: 't', location: null, at: new Date(Date.UTC(2026, 10, 1, hour)) })
  assert.equal(currentStatus('Delivered', [ev('IN_TRANSIT', 1)]), 'DELIVERED')
  assert.equal(currentStatus('some odd words', [ev('DELIVERED', 9), ev('IN_TRANSIT', 3)]), 'DELIVERED')
  assert.equal(currentStatus('some odd words', [ev('IN_TRANSIT', 9), ev('DELIVERED', 3)]), 'IN_TRANSIT') // newest wins, whatever the list order
  assert.equal(currentStatus(null, []), null)
})

test('event key ignores case and spacing so the same news is saved once', () => {
  const at = new Date(Date.UTC(2026, 10, 1, 9))
  assert.equal(eventKey({ status: 'IN_TRANSIT', text: ' Arrived at Hub ', at }), eventKey({ status: 'IN_TRANSIT', text: 'arrived at hub', at }))
  assert.notEqual(eventKey({ status: 'IN_TRANSIT', text: 'x', at }), eventKey({ status: 'DELIVERED', text: 'x', at }))
})

test('courier dates: ISO, Pakistani day-first, and refusal of nonsense', () => {
  assert.equal(parseCourierDate('2026-10-21T10:00:00Z')?.toISOString(), '2026-10-21T10:00:00.000Z')
  assert.equal(parseCourierDate('2026-10-21 15:00:00')?.toISOString(), '2026-10-21T10:00:00.000Z') // no zone = Pakistan time
  assert.equal(parseCourierDate('21-10-2026 15:00')?.toISOString(), '2026-10-21T10:00:00.000Z')
  assert.equal(parseCourierDate('2026-10-21T15:00:00+05:00')?.toISOString(), '2026-10-21T10:00:00.000Z')
  for (const bad of ['', 'yesterday', '2026-02-31', '32-01-2026', '2026-13-01', null, 42]) assert.equal(parseCourierDate(bad as never), null, String(bad))
})

// -------------------------------------------------- tracking reply parsing
test('PostEx tracking reply is read; broken replies give null', () => {
  const ok = parsePostexTrack({ statusCode: '200', dist: { transactionStatus: 'Out For Delivery', transactionStatusHistory: [
    { transactionStatusMessage: 'Booked', updatedAt: '2026-10-20 10:00:00' }, { transactionStatusMessage: 'Out For Delivery', updatedAt: '2026-10-22 09:30:00' }] } })
  assert.equal(ok?.statusText, 'Out For Delivery')
  assert.equal(ok?.events.length, 2)
  assert.equal(ok?.events[1].status, 'OUT_FOR_DELIVERY')
  assert.equal(ok?.events[1].at?.toISOString(), '2026-10-22T04:30:00.000Z')
  for (const bad of [null, 'text', {}, { statusCode: '500' }, { statusCode: '200' }, { statusCode: '200', dist: {} }, { statusCode: '200', dist: { transactionStatusHistory: 'x' } }]) assert.equal(parsePostexTrack(bad), null, JSON.stringify(bad))
})

test('Leopards tracking reply is read; broken replies give null', () => {
  const ok = parseLeopardsTrack({ status: 1, packet_list: [{ booked_packet_status: 'Delivered', 'Tracking Detail': [
    { Status: 'Pending', Activity_Date: '2026-10-20', Activity_Time: '10:00:00' }, { Status: 'Delivered', Reason: 'Received by owner', Activity_Date: '2026-10-23', Activity_Time: '16:00:00', Location: 'Lahore' }] }] })
  assert.equal(ok?.statusText, 'Delivered')
  assert.equal(ok?.events[1].text, 'Delivered: Received by owner')
  assert.equal(ok?.events[1].location, 'Lahore')
  assert.equal(ok?.events[1].status, 'DELIVERED')
  for (const bad of [null, {}, { status: 0 }, { status: 1 }, { status: 1, packet_list: [] }, { status: 1, packet_list: ['x'] }]) assert.equal(parseLeopardsTrack(bad), null, JSON.stringify(bad))
})

// ------------------------------------------- adapters (network is injected)
const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

test('PostEx track: success, bad token, no news, network failure', async () => {
  const good = await postexAdapter.track('TN12345', { apiToken: 't' }, {}, reply({ statusCode: '200', dist: { transactionStatus: 'Delivered', transactionStatusHistory: [] } }))
  assert.deepEqual(good.ok && good.statusText, 'Delivered')
  const calls: string[] = []
  await postexAdapter.track('TN 12/3', { apiToken: 't' }, {}, (async (url: string) => { calls.push(String(url)); return new Response('{}') }) as unknown as typeof fetch)
  assert.ok(calls[0].endsWith('/v1/track-order/TN%2012%2F3')) // the tracking number is URL-encoded
  const denied = await postexAdapter.track('TN12345', { apiToken: 'bad' }, {}, reply({}, 401))
  assert.equal(!denied.ok && /rejected your API token/.test(denied.error), true)
  const none = await postexAdapter.track('TN12345', { apiToken: 't' }, {}, reply({ statusCode: '404', statusMessage: 'Not found' }))
  assert.equal(!none.ok && /no tracking news/.test(none.error), true)
  const down = await postexAdapter.track('TN12345', { apiToken: 't' }, {}, (async () => { throw new Error('boom') }) as unknown as typeof fetch)
  assert.equal(!down.ok && /We will ask again/.test(down.error), true)
})

test('Leopards track: success and rejected key; secrets never appear in errors', async () => {
  const good = await leopardsAdapter.track('LH123456', { apiKey: 'K', apiPassword: 'P' }, {}, reply({ status: 1, packet_list: [{ booked_packet_status: 'Pending', 'Tracking Detail': [] }] }))
  assert.equal(good.ok && good.statusText, 'Pending')
  const bad = await leopardsAdapter.track('LH123456', { apiKey: 'SECRETKEY', apiPassword: 'SECRETPASS' }, {}, reply({ status: 0, error: 'Invalid API' }))
  assert.equal(bad.ok, false)
  assert.ok(!JSON.stringify(bad).includes('SECRET'))
})

// ------------------------------------------------------------ owner switch
test('auto-update is OFF unless the owner switched it on, and survives save/read', () => {
  assert.equal(readCourierConfig(undefined).autoUpdate, false)
  assert.equal(readCourierConfig({ couriers: { enabled: ['tcs'], autoUpdate: 'yes' } }).autoUpdate, false) // only a real true counts
  assert.equal(readCourierConfig({ couriers: { enabled: ['tcs'], autoUpdate: true } }).autoUpdate, true)
  const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null })
  const on = parseCourierForm(form({ 'courier.tcs': 'on', autoUpdate: 'on' }))
  const off = parseCourierForm(form({ 'courier.tcs': 'on' }))
  assert.equal(on.ok && on.value.autoUpdate, true)
  assert.equal(off.ok && off.value.autoUpdate, false)
})
