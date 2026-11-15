import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  DEFAULT_FRAUD_SETTINGS, HELD_MESSAGE, actionForScore, confirmMessage, decide, isHeld, networkLabel, parseFraudForm, phoneProblem, readFraudSettings, summariseHistory, worseLabel,
  type NetworkHistory, type Signals,
} from '@/lib/fraud/rules'
import { publicIp, readIpqsReply, ipRisk } from '@/lib/fraud/ip-risk'
import { parseOrderQuery, orderHref, CHECK_WHERE } from '@/lib/admin/order-list'

const clean: NetworkHistory = { delivered: 0, returned: 0, blockedByStores: 0, addressReturned: 0 }
const base: Signals = { phone: '+923014567893', network: clean, codLast24h: 1, own: { orders: 0, delivered: 0 }, total: 2500, firstOrderAverage: 2000, ip: null }
const codes = (s: Partial<Signals>) => decide({ ...base, ...s }).reasons.filter((r) => r.level !== 'good').map((r) => r.code)

test('step 1: fake phone numbers are caught with no outside service', () => {
  for (const ok of ['+923014567893', '03014567893', '0301-4567893', '923454567893', '0355 5123987', '+92 311 2345619']) assert.equal(phoneProblem(ok), null, ok)
  for (const fake of ['0300-0000000', '+923001111111', '03009999999', '0300-1234567', '03007654321', '03000123456', '+923339876543']) assert.match(phoneProblem(fake)!, /made-up numbers/, fake)
  for (const dead of ['03501234985', '+923991234985', '03601234985']) assert.match(phoneProblem(dead)!, /No mobile company/, dead)
  for (const foreign of ['', '+14155550100', '0421234567', '+447911123456', '030012345', 'abc', '+9230145678931']) assert.match(phoneProblem(foreign)!, /not a Pakistani mobile number/, foreign)
  // Numbers with a repeated digit or a short run are ordinary and must pass.
  for (const real of ['03001000100', '03214440000', '03451234500', '03332221110']) assert.equal(phoneProblem(real), null, real)
  assert.equal(decide({ ...base, phone: '0300-0000000' }).status, 'BLOCK')
})

test('step 2: the trust label comes from delivered and refused parcels across the platform', () => {
  assert.equal(networkLabel(clean), 'NEUTRAL', 'nobody knows this buyer yet')
  assert.equal(networkLabel({ ...clean, delivered: 1 }), 'NEUTRAL')
  assert.equal(networkLabel({ ...clean, delivered: 2 }), 'TRUSTED')
  assert.equal(networkLabel({ ...clean, delivered: 9, returned: 1 }), 'NEUTRAL', 'one refusal among many deliveries')
  assert.equal(networkLabel({ ...clean, returned: 1 }), 'RISKY', 'only ever refused')
  assert.equal(networkLabel({ ...clean, delivered: 2, returned: 2 }), 'RISKY')
  assert.equal(networkLabel({ ...clean, delivered: 12, returned: 3 }), 'NEUTRAL', 'a long-standing customer with a few returns')
  assert.equal(networkLabel({ ...clean, delivered: 12, returned: 6 }), 'RISKY')
  assert.equal(networkLabel({ ...clean, delivered: 30, blockedByStores: 1 }), 'RISKY', 'another shop blocked the number')
  // A partner network can only make the label more careful, never less.
  assert.equal(worseLabel('TRUSTED', 'RISKY'), 'RISKY'); assert.equal(worseLabel('RISKY', 'TRUSTED'), 'RISKY'); assert.equal(worseLabel('NEUTRAL', null), 'NEUTRAL'); assert.equal(worseLabel('TRUSTED', 'NEUTRAL'), 'NEUTRAL')
  assert.equal(decide({ ...base, partnerLabel: 'RISKY' }).label, 'RISKY')
})

test('step 3: the IP score is read strictly and only sent for public addresses', async () => {
  assert.deepEqual(readIpqsReply({ success: true, fraud_score: 88.4, proxy: false, vpn: true, country_code: 'DE' }), { score: 88, proxy: true, country: 'DE' })
  assert.deepEqual(readIpqsReply({ success: true, fraud_score: 0, country_code: 'PK' }), { score: 0, proxy: false, country: 'PK' })
  for (const bad of [null, {}, { success: false, fraud_score: 90 }, { success: true }, { success: true, fraud_score: '90' }, { success: true, fraud_score: 140 }, { success: 'true', fraud_score: 5 }]) assert.equal(readIpqsReply(bad), null, JSON.stringify(bad))
  assert.equal(readIpqsReply({ success: true, fraud_score: 5, country_code: 'Pakistan' })!.country, null)
  for (const priv of ['', 'unknown', '127.0.0.1', '10.1.2.3', '192.168.1.5', '172.20.0.1', '100.64.0.9', '169.254.1.1', '::1', 'fe80::1', 'fd00::1', '999.1.1.1']) assert.equal(publicIp(priv), null, priv)
  assert.equal(publicIp('39.32.10.7'), '39.32.10.7'); assert.equal(publicIp('2400:adc1::5'), '2400:adc1::5')
  assert.deepEqual([actionForScore(10), actionForScore(75), actionForScore(84), actionForScore(85)], ['allow', 'review', 'review', 'block'])
  // The service is never called for a private address or a malformed key; a failure means "not checked", never an error.
  let calls = 0
  const KEY = 'a'.repeat(32)
  const f = (async (url: string) => { calls++; assert.ok(String(url).startsWith(`https://www.ipqualityscore.com/api/json/ip/${KEY}/39.32.10.7?`)); return new Response(JSON.stringify({ success: true, fraud_score: 30, country_code: 'PK' })) }) as unknown as typeof fetch
  assert.equal(await ipRisk(KEY, '10.0.0.1', f), null); assert.equal(await ipRisk('short', '39.32.10.7', f), null); assert.equal(calls, 0)
  assert.deepEqual(await ipRisk(KEY, '39.32.10.7', f), { score: 30, proxy: false, country: 'PK' }); assert.equal(calls, 1)
  assert.equal(await ipRisk(KEY, '39.32.10.7', (async () => { throw new Error('down') }) as unknown as typeof fetch), null)
  assert.equal(await ipRisk(KEY, '39.32.10.7', (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch), null)
  assert.equal(await ipRisk(KEY, '39.32.10.7', (async () => new Response('<html>')) as unknown as typeof fetch), null)
})

test('step 4: speed and history are counted across every store, from the buyer’s orders', () => {
  const now = new Date('2026-11-15T12:00:00Z'), ago = (h: number) => new Date(now.getTime() - h * 3600_000)
  const rows = [
    { id: 'this', storeId: 'A', status: 'PLACED', placedAt: ago(0), cod: true },
    { id: 'o2', storeId: 'B', status: 'PLACED', placedAt: ago(2), cod: true },
    { id: 'o3', storeId: 'C', status: 'CANCELLED', placedAt: ago(3), cod: true }, // cancelled: not counted towards speed
    { id: 'o4', storeId: 'B', status: 'PLACED', placedAt: ago(5), cod: false },   // prepaid: not counted towards speed
    { id: 'o5', storeId: 'A', status: 'DELIVERED', placedAt: ago(500), cod: true },
    { id: 'o6', storeId: 'C', status: 'RETURNED', placedAt: ago(900), cod: true },
    { id: 'o7', storeId: 'C', status: 'DELIVERED', placedAt: ago(25), cod: true }, // 25 h ago: outside the day
  ]
  assert.deepEqual(summariseHistory(rows, 'A', 'this', now), { delivered: 2, returned: 1, codLast24h: 2, own: { orders: 1, delivered: 1 } })
  assert.deepEqual(summariseHistory([], 'A', 'this', now), { delivered: 0, returned: 0, codLast24h: 0, own: { orders: 0, delivered: 0 } })
  // Velocity: more than the limit in 24 hours is blocked; exactly the limit is not.
  assert.deepEqual(codes({ codLast24h: 3 }), []); assert.deepEqual(codes({ codLast24h: 4 }), ['velocity'])
  assert.equal(decide({ ...base, codLast24h: 4 }).status, 'BLOCK')
  assert.equal(decide({ ...base, codLast24h: 4 }, { ...DEFAULT_FRAUD_SETTINGS, velocityLimit: 5 }).status, 'CLEAR', 'the store’s own limit is used')
  // Refused before: a warning even when the label is not risky.
  assert.deepEqual(codes({ network: { ...clean, delivered: 6, returned: 1 } }), ['refused'])
  assert.deepEqual(codes({ network: { ...clean, addressReturned: 2 } }), ['address'])
  // A large FIRST order: only first-time buyers, only when the store has an average to compare with.
  assert.deepEqual(codes({ total: 6001 }), ['first-large']); assert.deepEqual(codes({ total: 6000 }), [])
  assert.deepEqual(codes({ total: 9000, firstOrderAverage: null }), [])
  assert.deepEqual(codes({ total: 9000, own: { orders: 2, delivered: 0 } }), [], 'ordered here before')
  assert.deepEqual(codes({ total: 9000, network: { ...clean, delivered: 3 } }), [], 'known good buyer elsewhere')
})

test('step 5: the signals become ONE decision with readable reasons', () => {
  const d = decide(base)
  assert.deepEqual([d.status, d.label, d.riskScore, d.recommendedAction], ['CLEAR', 'NEUTRAL', null, null])
  assert.equal(d.reasons.length, 1); assert.equal(d.reasons[0].level, 'good')
  // One warning: review.
  assert.equal(decide({ ...base, network: { ...clean, returned: 1 } }).status, 'REVIEW', 'risky label alone')
  assert.equal(decide({ ...base, total: 9000 }).status, 'REVIEW', 'large first order')
  assert.equal(decide({ ...base, ip: { score: 20, proxy: false, country: 'AE' } }).status, 'REVIEW', 'placed from abroad')
  assert.equal(decide({ ...base, ip: { score: 20, proxy: true, country: 'PK' } }).status, 'REVIEW', 'VPN')
  // Risky label together with another warning: block.
  assert.equal(decide({ ...base, network: { ...clean, returned: 2 }, total: 9000, firstOrderAverage: 2000, own: { orders: 0, delivered: 0 } }).status, 'BLOCK')
  assert.equal(decide({ ...base, network: { ...clean, returned: 1, addressReturned: 1 } }).status, 'BLOCK')
  // Two warnings without a risky label: still review; three: block.
  assert.equal(decide({ ...base, total: 9000, ip: { score: 80, proxy: false, country: 'PK' } }).status, 'REVIEW')
  assert.equal(decide({ ...base, total: 9000, ip: { score: 80, proxy: false, country: 'AE' } }).status, 'BLOCK')
  // The IP score and what it suggests are kept for the order.
  const ip = decide({ ...base, ip: { score: 91, proxy: true, country: 'PK' } })
  assert.deepEqual([ip.riskScore, ip.recommendedAction, ip.status], [91, 'block', 'REVIEW'])
  assert.equal(ip.reasons.filter((r) => r.code.startsWith('ip')).length, 1, 'a high score with a VPN is one warning, not two')
  // A trusted buyer and the store's own customer are said out loud.
  assert.match(decide({ ...base, network: { ...clean, delivered: 4 } }).reasons[0].text, /Trusted buyer/)
  assert.match(decide({ ...base, own: { orders: 3, delivered: 3 }, network: { ...clean, delivered: 3 } }).reasons[0].text, /Your own customer/)
  // Every reason is a full sentence for the owner, and never names another store.
  for (const r of decide({ ...base, phone: '03000000000', codLast24h: 9, network: { delivered: 1, returned: 3, blockedByStores: 2, addressReturned: 1 }, ip: { score: 95, proxy: true, country: 'US' } }).reasons) {
    assert.match(r.text, /^[A-Z].*\.$/, r.text); assert.doesNotMatch(r.text, /store[A-Z]|storeId|undefined|NaN/)
  }
  assert.equal(isHeld({ verificationStatus: 'REVIEW' }), true); assert.equal(isHeld({ verificationStatus: 'BLOCK' }), true)
  for (const free of ['CLEAR', null, undefined, '']) assert.equal(isHeld({ verificationStatus: free }), false, 'older, prepaid and counter orders are never held')
})

test('settings: safe defaults, and numbers outside their range are refused', () => {
  assert.deepEqual(readFraudSettings(null), DEFAULT_FRAUD_SETTINGS); assert.deepEqual(readFraudSettings({ fraud: 'x' }), DEFAULT_FRAUD_SETTINGS)
  assert.deepEqual(readFraudSettings({ fraud: { enabled: false, velocityLimit: 5, ipCheckOver: 0, firstOrderMultiple: 99 }, couriers: {} }), { enabled: false, velocityLimit: 5, ipCheckOver: 0, firstOrderMultiple: 3 })
  const form = (o: Record<string, unknown>) => parseFraudForm((k) => o[k])
  assert.deepEqual(form({ enabled: 'on', velocityLimit: '4', ipCheckOver: '8000', firstOrderMultiple: '5' }), { ok: true, value: { enabled: true, velocityLimit: 4, ipCheckOver: 8000, firstOrderMultiple: 5 } })
  assert.equal((form({ velocityLimit: '2', ipCheckOver: '0', firstOrderMultiple: '2' }) as { value: { enabled: boolean } }).value.enabled, false)
  for (const bad of [{ velocityLimit: '0' }, { velocityLimit: '21' }, { velocityLimit: '2.5' }, { ipCheckOver: '-1' }, { firstOrderMultiple: '1' }, { velocityLimit: 'many' }]) {
    const r = form({ velocityLimit: '3', ipCheckOver: '5000', firstOrderMultiple: '3', ...bad })
    assert.ok(!r.ok && /whole number from/.test(r.error), JSON.stringify(bad))
  }
  assert.match(confirmMessage({ name: 'Ali Khan', number: '1004', total: 7500, store: 'Ali Store', city: 'Lahore' }), /^Assalam o Alaikum Ali, this is Ali Store\. We received your order #1004 of Rs\. 7,500 \(cash on delivery\) for Lahore\. Please reply YES/)
})

test('a held order cannot be booked, shipped or moved on until the owner approves it', () => {
  const booking = readFileSync('lib/couriers/booking.ts', 'utf8')
  assert.match(booking, /if \(isHeld\(order\)\) return \{ status: 'skipped', reason: HELD_MESSAGE \}/)
  assert.ok(booking.indexOf('if (isHeld(order))') < booking.indexOf('const adapter = getCourierAdapter(provider)'), 'checked before any courier is contacted')
  assert.match(booking, /const orderSelect = \{[^}]*verificationStatus: true/)
  const svc = readFileSync('lib/admin/orders.ts', 'utf8')
  assert.equal([...svc.matchAll(/if \(isHeld\(order\)[^)]*\) throw new AdminError\(HELD_MESSAGE\)/g)].length, 3, 'status change, manual shipment and the older booking path')
  assert.match(svc, /isHeld\(order\) && to !== 'RETURNED'/, 'a parcel that is already out can still be marked returned')
  assert.ok(HELD_MESSAGE.includes('approve it or cancel it'))
  // Checkout: the check runs first, the booking after it, and both after the customer has their answer.
  const route = readFileSync('app/api/orders/route.ts', 'utf8')
  assert.match(route, /await verifyByNumber\(store\.id, order\.number, ip\); await autoBookByNumber\(store\.id, order\.number\) \}\)/)
})

test('the check stays inside its rules: store-scoped writes, counts only across stores, nothing secret stored', () => {
  const v = readFileSync('lib/fraud/verify.ts', 'utf8')
  assert.match(v, /db\.order\.findFirst\(\{ where: \{ id: orderId, storeId \}/); assert.match(v, /db\.order\.updateMany\(\{\s*where: \{ id: order\.id, storeId \}/)
  assert.match(v, /order\.source !== 'ONLINE' \|\| order\.payments\[0\]\?\.method !== 'COD'\) return null/, 'only online cash-on-delivery orders')
  assert.match(v, /isPublic: false/); assert.doesNotMatch(v, /isPublic: true/, 'the customer never sees the check')
  assert.match(v, /total <= rules\.ipCheckOver\) return \{ asked: false/, 'the paid service is only asked above the limit')
  assert.match(v, /getServiceSecrets\(storeId, 'ipqs'\)/, 'with the store’s own account')
  assert.doesNotMatch(v, /ip: opts\.ip|ipAddress/, 'the buyer’s IP address itself is not stored')
  assert.match(v, /where: \{ id: order\.id, storeId: admin\.storeId, verificationStatus: order\.verificationStatus \}/, 'approval is compare-and-set')
  const net = readFileSync('lib/fraud/network.ts', 'utf8')
  // Across stores only ids, statuses, dates and counts are read: no names, addresses, totals or items.
  const select = /select: \{ id: true, storeId: true, status: true, placedAt: true, payments: \{ select: \{ method: true \}/
  assert.match(net, select)
  assert.doesNotMatch(net, /customerName: true|total: true|items:|landmark: true|customerEmail/)
  assert.match(net, /db\.blocklistEntry\.count\(/); assert.match(net, /"storeId" = \$\{storeId\}/, 'the first-order average is the store’s own')
  assert.match(readFileSync('lib/fraud/ip-risk.ts', 'utf8'), /never the URL: it contains the key/)
  // The owner's actions check permission, and the order page shows the card.
  const actions = readFileSync('app/admin/(panel)/orders/[id]/actions.ts', 'utf8')
  const fn = actions.slice(actions.indexOf('export async function verificationAction'))
  assert.match(fn, /adminOrError\('orders\.update'\)/); assert.match(fn, /approveHeldOrder\(g\.admin, orderId\)/); assert.match(fn, /action: 'order\.verification\.approve'/)
  assert.match(readFileSync('app/admin/(panel)/orders/[id]/page.tsx', 'utf8'), /<VerificationCard order=/)
  assert.match(readFileSync('lib/fraud/store.ts', 'utf8'), /\.\.\.\(\(current\?\.extra \?\? \{\}\) as Record<string, unknown>\), fraud:/, 'other settings in the same place are kept')
})

test('the orders list can show what the check is holding', () => {
  assert.equal(parseOrderQuery({ check: 'held' }).check, 'held'); assert.equal(parseOrderQuery({ check: 'nonsense' }).check, null); assert.equal(parseOrderQuery({}).check, null)
  assert.deepEqual(CHECK_WHERE.held, { in: ['REVIEW', 'BLOCK'] })
  assert.equal(orderHref(parseOrderQuery({ check: 'block', page: '3' }), { status: 'PLACED' }), '/admin/orders?status=PLACED&check=block')
  const page = readFileSync('app/admin/(panel)/orders/page.tsx', 'utf8')
  assert.match(page, /if \(q\.check\) where\.verificationStatus = CHECK_WHERE\[q\.check\]/)
  assert.match(page, /db\.order\.count\(\{ where: \{ storeId: admin\.storeId, verificationStatus: \{ in: \['REVIEW', 'BLOCK'\] \}/)
})
