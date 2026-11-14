import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { NOTE_IDEAS, NOTE_MAX, STAGE_TODO, TRACK_ACTIVE, TRACK_DONE, TRACK_STAGES, isLate, parseCustomerNote, stageSince, trackHref, trackSearch, trackStage, waited, whatsappNumber, whatsappUpdate } from '@/lib/admin/order-tracking'
import { NEXT_STATUSES } from '@/lib/admin/order-rules'

test('the tracking stages are exactly the order statuses, each with a to-do line', () => {
  assert.deepEqual([...TRACK_STAGES].sort(), Object.keys(NEXT_STATUSES).sort())
  assert.deepEqual([...TRACK_ACTIVE], ['PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY'])
  for (const s of TRACK_STAGES) assert.ok(STAGE_TODO[s].length > 15, s)
  for (const s of TRACK_DONE) if (s !== 'DELIVERED') assert.deepEqual(NEXT_STATUSES[s], [], `${s} is an end`)
  // Ready-made notes exist only for steps an order can really be moved to, and fit the limit.
  const targets = new Set(Object.values(NEXT_STATUSES).flat())
  for (const [s, list] of Object.entries(NOTE_IDEAS)) { assert.ok(targets.has(s as never), s); for (const n of list!) assert.equal(parseCustomerNote(n), n) }
})

test('stage and search come from the address and can never break the page', () => {
  assert.equal(trackStage('shipped'), 'SHIPPED')
  assert.equal(trackStage(['PACKED', 'x']), 'PACKED')
  for (const junk of [undefined, null, '', 'nope', 7, '<script>']) assert.equal(trackStage(junk), 'PLACED')
  assert.equal(trackSearch('  1004\u0000 '), '1004')
  assert.equal(trackSearch('x'.repeat(200)).length, 60)
  assert.equal(trackHref('PLACED'), '/admin/order-tracking')
  assert.equal(trackHref('SHIPPED'), '/admin/order-tracking?stage=SHIPPED')
  assert.equal(trackHref('SHIPPED', 'ali & co'), '/admin/order-tracking?q=ali%20%26%20co')
})

test('waiting time: counted from arrival at the step, and notes do not restart the clock', () => {
  const now = new Date('2026-11-14T12:00:00Z'), ago = (h: number) => new Date(now.getTime() - h * 3600_000)
  assert.equal(waited(ago(0.5), now), '30 min'); assert.equal(waited(ago(5), now), '5 h'); assert.equal(waited(ago(47), now), '47 h'); assert.equal(waited(ago(72), now), '3 days')
  assert.equal(waited(new Date(now.getTime() + 60_000), now), '0 min', 'a clock a little ahead never shows a negative time')
  assert.equal(isLate('PLACED', ago(23), now), false); assert.equal(isLate('PLACED', ago(25), now), true)
  assert.equal(isLate('SHIPPED', ago(100), now), false); assert.equal(isLate('SHIPPED', ago(121), now), true)
  for (const s of TRACK_DONE) assert.equal(isLate(s, ago(9999), now), false, 'finished orders are never late')
  // Newest first: two notes at SHIPPED after the move to SHIPPED 30 h ago.
  const history = [{ status: 'SHIPPED', createdAt: ago(1) }, { status: 'SHIPPED', createdAt: ago(10) }, { status: 'SHIPPED', createdAt: ago(30) }, { status: 'PACKED', createdAt: ago(40) }]
  assert.deepEqual(stageSince('SHIPPED', history, ago(50)), ago(30))
  assert.deepEqual(stageSince('PLACED', [], ago(50)), ago(50), 'no history: since the order was placed')
  assert.deepEqual(stageSince('PACKED', [{ status: 'CONFIRMED', createdAt: ago(3) }], ago(50)), ago(3), 'history out of step: the latest line')
})

test('a note for the customer is one line of plain text, at most 300 characters', () => {
  assert.equal(parseCustomerNote('  Rider   is on\n the way \t'), 'Rider is on the way')
  assert.equal(parseCustomerNote('a'.repeat(500))!.length, NOTE_MAX)
  for (const empty of ['', '   ', '\n\t', null, undefined, 5, {}]) assert.equal(parseCustomerNote(empty), null)
  assert.equal(parseCustomerNote('<b>Hi</b>'), '<b>Hi</b>', 'kept as text; the pages escape it when showing')
})

test('WhatsApp link: opens the owner’s own WhatsApp with the message written, only for real mobile numbers', () => {
  for (const ok of ['03001234567', '0300-1234567', '+92 300 1234567', '923001234567', '00923001234567', '3001234567']) assert.equal(whatsappNumber(ok), '923001234567', ok)
  for (const bad of ['', '0421234567', '12345', '030012345678', 'abc', '+1 415 555 0100']) assert.equal(whatsappNumber(bad), null, bad)
  const base = { phone: '03001234567', name: 'Ali Khan', number: '1004', status: 'SHIPPED', trackingCode: 'MP-7K4Q-9XMD', store: 'Ali Store' }
  const link = whatsappUpdate({ ...base, note: 'Arrives in 2 days & more' })!
  assert.ok(link.startsWith('https://wa.me/923001234567?text='))
  const text = decodeURIComponent(link.split('text=')[1])
  assert.equal(text, 'Assalam o Alaikum Ali, your order #1004 from Ali Store is now: Shipped. Arrives in 2 days & more Your tracking code is MP-7K4Q-9XMD.')
  assert.ok(!link.split('text=')[1].includes('&'), 'the message cannot add parameters to the link')
  assert.ok(!decodeURIComponent(whatsappUpdate({ ...base, note: 'Shipped' })!.split('text=')[1]).includes('Shipped. Shipped'), 'the default note is not repeated')
  assert.equal(whatsappUpdate({ ...base, phone: '0421234567' }), null)
})

test('the page and its actions stay inside the store and go through the one status function', () => {
  const page = readFileSync('app/admin/(panel)/order-tracking/page.tsx', 'utf8')
  assert.match(page, /await requireAdmin\('orders\.view'\)/)
  for (const q of page.matchAll(/db\.(order|storeSettings)\.\w+\(\{[\s\S]{0,140}/g)) assert.match(q[0], /admin\.storeId|where,/, q[0].slice(0, 50))
  assert.match(page, /\? \{ storeId: admin\.storeId, OR: \[/); assert.match(page, /: \{ storeId: admin\.storeId, status: stage \}/)
  assert.match(page, /take: TRACK_PAGE_SIZE/)
  const actions = readFileSync('app/admin/(panel)/order-tracking/actions.ts', 'utf8')
  assert.equal([...actions.matchAll(/export async function/g)].length, [...actions.matchAll(/await adminOrError\('orders\.update'\)/g)].length)
  assert.match(actions, /changeOrderStatus\(g\.admin, orderId, to as OrderStatus/, 'same rules as every other status button')
  assert.doesNotMatch(actions, /'CANCELLED'/, 'cancelling (restock, refund) is not possible from here')
  assert.equal([...actions.matchAll(/await audit\(/g)].length, 2); assert.equal([...actions.matchAll(/rateLimit\(/g)].length, 2)
  const svc = readFileSync('lib/admin/orders.ts', 'utf8')
  const fn = svc.slice(svc.indexOf('export async function addCustomerUpdate'), svc.indexOf('/** Cancel before dispatch'))
  assert.match(fn, /where: \{ id: orderId, storeId: admin\.storeId \}/); assert.match(fn, /status: order\.status, note: clean, isPublic: true/)
  // The menu shows it to everyone who may see orders.
  assert.match(readFileSync('components/admin/AdminNav.tsx', 'utf8'), /href: '\/admin\/order-tracking', label: 'Order tracking'/)
  assert.match(readFileSync('app/admin/(panel)/layout.tsx', 'utf8'), /const allowed = \['\/admin', '\/admin\/orders', '\/admin\/order-tracking'/)
})
