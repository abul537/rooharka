import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DEFAULT_NOTIFY, NOTIFY_EVENTS, customerMessage, newOrderMail, parseNotifyForm, readNotify, type OrderFacts } from '@/lib/notify/rules'
import { leadMessage, parseLead, readLeadLines } from '@/lib/leads'

const facts: OrderFacts = { store: 'Ali Store', name: 'Ali Khan', number: '1004', total: 2700, due: 2700, trackingCode: 'MP-7K4Q-9XMD', trackUrl: 'https://alistore.pk/track?code=MP-7K4Q-9XMD' }

test('customer messages: one for each step, short, and nothing typed by a person can smuggle in a link', () => {
  for (const e of NOTIFY_EVENTS) {
    const m = customerMessage(e, facts)
    assert.ok(m.startsWith('Ali, '), e); assert.ok(m.includes('#1004'), e); assert.ok(m.length <= 160, `${e} fits one SMS (${m.length})`)
  }
  assert.equal(customerMessage('PLACED', facts), 'Ali, Ali Store received your order #1004 (Rs. 2,700). Track: https://alistore.pk/track?code=MP-7K4Q-9XMD')
  assert.match(customerMessage('PLACED', { ...facts, trackUrl: null }), /Tracking code: MP-7K4Q-9XMD$/)
  assert.match(customerMessage('SHIPPED', { ...facts, trackUrl: null, courier: 'postex', courierTrackingNo: 'PX123' }), /shipped with postex \(no\. PX123\)\./)
  assert.match(customerMessage('OUT_FOR_DELIVERY', facts), /Please keep Rs\. 2,700 ready\.$/)
  assert.doesNotMatch(customerMessage('OUT_FOR_DELIVERY', { ...facts, due: 0 }), /keep/, 'a prepaid order is not asked for cash')
  const evil = customerMessage('CONFIRMED', { ...facts, name: 'Win https://evil.example\nnow', store: 'Shop www.evil.pk' })
  assert.doesNotMatch(evil, /evil|\n/); assert.ok(evil.startsWith('Win, '))
})

test('message settings: off by default (they cost the owner money), read and saved safely', () => {
  assert.deepEqual(readNotify(null), DEFAULT_NOTIFY); assert.deepEqual(DEFAULT_NOTIFY.events, [], 'no customer message is sent until the owner ticks one')
  assert.deepEqual(readNotify({ notify: { channel: 'WHATSAPP', events: ['SHIPPED', 'NONSENSE', 'PLACED'], ownerEmail: false, dailyLimit: 50 } }), { channel: 'WHATSAPP', events: ['PLACED', 'SHIPPED'], ownerEmail: false, dailyLimit: 50 })
  assert.equal(readNotify({ notify: { dailyLimit: 0 } }).dailyLimit, 300)
  const form = (o: Record<string, string>) => parseNotifyForm((k) => o[k])
  assert.deepEqual(form({ channel: 'SMS', 'event-SHIPPED': 'on', 'event-DELIVERED': 'on', dailyLimit: '200' }), { ok: true, value: { channel: 'SMS', events: ['SHIPPED', 'DELIVERED'], ownerEmail: false, dailyLimit: 200 } })
  for (const bad of ['', '0', '20001', 'many', '1.5']) assert.equal(form({ dailyLimit: bad }).ok, false, bad)
})

test('the new-order email is escaped and holds no more than the owner needs', () => {
  const m = newOrderMail('owner@example.com', { store: 'Ali <Store>', number: '1004', customer: 'Ali <b>Khan</b>', city: 'Lahore', total: 2700, payment: 'cash on delivery', lines: [{ name: 'Honey (500g) <script>', quantity: '2' }], dashboardUrl: 'https://alistore.pk/admin/orders/abc' })
  assert.equal(m.subject, 'New order #1004: Rs. 2,700 (Ali <b>Khan</b>, Lahore)')
  assert.doesNotMatch(m.html, /<script>|<b>Khan/); assert.match(m.html, /Honey \(500g\) &lt;script&gt; &times; 2/); assert.match(m.html, /href="https:\/\/alistore\.pk\/admin\/orders\/abc"/)
  assert.match(m.text, /- Honey \(500g\) <script> x 2/)
})

test('messages are sent once per step, through the store’s own provider, and can never break an order change', () => {
  const send = readFileSync('lib/notify/send.ts', 'utf8')
  assert.match(send, /where: \{ id: orderId, storeId, source: 'ONLINE' \}/, 'counter sales are not messaged')
  assert.match(send, /where: \{ id: order\.id, storeId, NOT: \{ notifiedStatuses: \{ has: order\.status \} \} \}, data: \{ notifiedStatuses: \{ push: order\.status \} \}/)
  assert.ok(send.indexOf('notifiedStatuses: { push') < send.indexOf('await sendMessage('), 'the step is claimed before sending')
  assert.match(send, /if \(!rules\.events\.includes\(order\.status\)\) return/); assert.match(send, /getServiceSecrets\(storeId, provider\.key\)/)
  assert.equal([...send.matchAll(/\} catch \(e\) \{ console\.error\('\[notify\]/g)].length, 2, 'both senders swallow their own failures')
  assert.match(send, /isPublic: false/); assert.doesNotMatch(send, /isPublic: true/)
  const orders = readFileSync('lib/admin/orders.ts', 'utf8')
  assert.equal([...orders.matchAll(/queueOrderMessage\(admin\.storeId, orderId\)/g)].length, 3, 'status change, cancel and manual shipment')
  for (const m of orders.matchAll(/const out = await db\.\$transaction[\s\S]*?\n  queueOrderMessage/g)) assert.ok(m[0].length > 50, 'the message is queued only after the change is saved')
  assert.match(readFileSync('app/api/orders/route.ts', 'utf8'), /await announceNewOrder\(store\.id, order\.number, origin\)/)
})

test('unfinished checkouts: a real phone, a name and real items, priced by the server, closed by an order', () => {
  const A = 'cmw6nl8o0000h7ctth6ql2ovc'
  assert.deepEqual(parseLead({ phone: '0300-1234567', name: ' Ali  <b>Khan</b> ', items: [{ variantId: A, quantity: 2, price: 1 }] }), { phone: '+923001234567', name: 'Ali b Khan /b', items: [{ variantId: A, quantity: 2 }] })
  for (const bad of [null, {}, { phone: '12345', name: 'Ali', items: [{ variantId: A, quantity: 1 }] }, { phone: '03001234567', name: 'A', items: [{ variantId: A, quantity: 1 }] }, { phone: '03001234567', name: 'Ali', items: [] }]) assert.equal(parseLead(bad), null)
  assert.deepEqual(readLeadLines([{ variantId: A, quantity: 2, name: 'Honey', label: '500g', price: 1000 }, { junk: 1 }, 'x']), [{ variantId: A, quantity: 2, name: 'Honey', label: '500g', price: 1000 }])
  assert.deepEqual(readLeadLines('nope'), [])
  assert.equal(leadMessage({ name: 'Ali Khan', store: 'Ali Store', first: 'Honey', more: 2, url: 'https://alistore.pk/checkout?items=x' }), 'Assalam o Alaikum Ali, this is Ali Store. You were ordering Honey and 2 more items but the order was not completed. Can we help? You can finish it here: https://alistore.pk/checkout?items=x')
  assert.doesNotMatch(leadMessage({ name: 'Ali', store: 'S', first: 'Honey', more: 0, url: null }), /more item|finish it here/)
  const api = readFileSync('app/api/checkout/lead/route.ts', 'utf8')
  assert.match(api, /loadCheckoutEntries\(store\.id, config\.maxQuantity, lead\.items\)/, 'names and prices come from the database')
  assert.match(api, /where: \{ storeId_phone: \{ storeId: store\.id, phone: lead\.phone \} \}/); assert.match(api, /isPreviewFor\(store\.id\)/)
  assert.match(readFileSync('lib/orders/create-order.ts', 'utf8'), /tx\.checkoutLead\.updateMany\(\{ where: \{ storeId, phone: input\.customer\.phone, recoveredAt: null \}, data: \{ recoveredAt: new Date\(\) \} \}\)/)
  const page = readFileSync('app/admin/(panel)/abandoned/page.tsx', 'utf8')
  assert.match(page, /where: \{ storeId: admin\.storeId, recoveredAt: null, updatedAt: \{ lt:/)
  assert.match(readFileSync('app/admin/(panel)/abandoned/actions.ts', 'utf8'), /const scope = \{ id, storeId: g\.admin\.storeId \}/)
})
