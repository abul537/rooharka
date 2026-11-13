import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BULK_STEP, MAX_BULK_ORDERS, MAX_SLIPS, ORDER_BULK, ORDER_BULK_TARGET, bulkSteps, bulkSummary, hasOrderFilters, orderDates, orderHref, parseBulkStep, parseOrderQuery, parseSlipIds,
} from '@/lib/admin/order-list'
import { NEXT_STATUSES } from '@/lib/admin/order-rules'

test('order filters: read from the address, strange values dropped', () => {
  assert.deepEqual(parseOrderQuery({}), { q: '', status: null, pay: null, source: null, when: null, from: null, to: null, page: 1 })
  const q = parseOrderQuery({ q: ' 0300 ', status: 'placed', pay: 'paid', source: 'counter', when: '7d', page: '2' })
  assert.deepEqual(q, { q: '0300', status: 'PLACED', pay: 'paid', source: 'counter', when: '7d', from: null, to: null, page: 2 })
  assert.deepEqual(parseOrderQuery({ status: 'HACK', pay: "x' OR 1=1", source: 'web', when: 'year', from: '2026-13-40', to: 'yesterday', page: '0' }), parseOrderQuery({}))
  assert.ok(hasOrderFilters(q)); assert.ok(!hasOrderFilters(parseOrderQuery({ page: '3' })))
})

test('order dates: Pakistan calendar days; exact dates win over a shortcut; reversed dates are swapped', () => {
  const d = parseOrderQuery({ from: '2026-11-10', to: '2026-11-12', when: '7d' })
  assert.equal(d.when, null)
  const r = orderDates(d)!
  assert.equal(r.gte!.toISOString(), '2026-11-09T19:00:00.000Z', 'midnight 10 Nov in Pakistan')
  assert.equal(r.lt!.toISOString(), '2026-11-12T19:00:00.000Z', 'the whole of 12 Nov is included')
  const swapped = parseOrderQuery({ from: '2026-11-12', to: '2026-11-10' })
  assert.deepEqual([swapped.from, swapped.to], ['2026-11-10', '2026-11-12'])
  assert.deepEqual(Object.keys(orderDates(parseOrderQuery({ from: '2026-11-10' }))!), ['gte'])
  assert.equal(orderDates(parseOrderQuery({ when: 'today' }), new Date('2026-11-13T22:59:00Z'))!.gte!.toISOString(), '2026-11-13T19:00:00.000Z')
  assert.equal(orderDates(parseOrderQuery({})), null)
  assert.equal(parseOrderQuery({ from: '2026-02-30' }).from, null, 'not a real date')
})

test('order links keep the other filters; changing one returns to page 1', () => {
  const q = parseOrderQuery({ q: 'ali', status: 'packed', page: '4', source: 'online' })
  assert.equal(orderHref(q, { status: null }), '/admin/orders?q=ali&source=online')
  assert.equal(orderHref(q, { page: 5 }), '/admin/orders?q=ali&status=PACKED&source=online&page=5')
  assert.equal(orderHref(parseOrderQuery({})), '/admin/orders')
})

test('bulk actions: one legal step forward each, small groups, sensible limits', () => {
  // Every bulk target is a step the single-order rules allow from somewhere, and none of them cancels.
  for (const a of ORDER_BULK) assert.ok(Object.values(NEXT_STATUSES).some((next) => next.includes(ORDER_BULK_TARGET[a])), a)
  assert.ok(!Object.values(ORDER_BULK_TARGET).includes('CANCELLED'))
  assert.deepEqual(parseBulkStep('pack', ['o1', 'o2', 'o1']), { ok: true, action: 'pack', ids: ['o1', 'o2'] })
  assert.equal(parseBulkStep('cancel', ['o1']).ok, false)
  assert.equal(parseBulkStep('pack', []).ok, false)
  assert.equal(parseBulkStep('pack', ['bad id!']).ok, false)
  assert.equal(parseBulkStep('pack', 'o1').ok, false)
  assert.equal(parseBulkStep('pack', Array.from({ length: BULK_STEP + 1 }, (_, i) => `o${i}`)).ok, false, 'a group is never larger than the step')
  const steps = bulkSteps(Array.from({ length: 12 }, (_, i) => `o${i}`))
  assert.deepEqual(steps.map((s) => s.length), [5, 5, 2])
  assert.equal(bulkSteps(Array.from({ length: 500 }, (_, i) => `o${i}`)).flat().length, MAX_BULK_ORDERS)
  assert.deepEqual(bulkSteps(['a', 'a', 'b']), [['a', 'b']])
  assert.deepEqual(bulkSteps([]), [])
})

test('bulk summary and packing-slip selection', () => {
  assert.equal(bulkSummary([{ id: 'a', number: '1', ok: true, message: '' }]), '1 order updated.')
  assert.equal(bulkSummary([{ id: 'a', number: '1', ok: true, message: '' }, { id: 'b', number: null, ok: false, message: 'x' }, { id: 'c', number: '3', ok: true, message: '' }]), '2 orders updated, 1 could not be changed (see below).')
  assert.deepEqual(parseSlipIds('o1,o2,,o1,bad id,../x'), ['o1', 'o2'])
  assert.equal(parseSlipIds(Array.from({ length: 80 }, (_, i) => `o${i}`).join(',')).length, MAX_SLIPS)
  assert.deepEqual(parseSlipIds(undefined), [])
})

import { parseSale, scanMatch, splitPayments, tillFromPayments } from '@/lib/pos/rules'

const sale = (o: Record<string, unknown>) => ({ items: [{ variantId: 'v1', quantity: 1 }], discount: '', paymentMethod: 'CASH', tendered: '', customerName: '', customerPhone: '', idempotencyKey: 'key-12345678', ...o })

test('POS split payment: parts come off first, the rest goes to the main method, and it always adds up', () => {
  assert.deepEqual(splitPayments(5000, 'CASH', []), { ok: true, value: [{ method: 'CASH', amount: 5000 }], rest: 5000 })
  const s = splitPayments(5000, 'CASH', [{ method: 'CARD', amount: 2000 }, { method: 'JAZZCASH', amount: 500.5 }])
  assert.ok(s.ok)
  if (s.ok) { assert.deepEqual(s.value, [{ method: 'CASH', amount: 2499.5 }, { method: 'CARD', amount: 2000 }, { method: 'JAZZCASH', amount: 500.5 }]); assert.equal(s.value.reduce((n, p) => n + p.amount, 0), 5000) }
  assert.equal(splitPayments(5000, 'CASH', [{ method: 'CARD', amount: 5000 }]).ok, false, 'nothing left for the main method')
  assert.equal(splitPayments(5000, 'CASH', [{ method: 'CARD', amount: 6000 }]).ok, false)
})

test('POS sale request: split parts are checked (different methods, amounts above zero, at most two)', () => {
  const ok = parseSale(sale({ split: [{ method: 'CARD', amount: '2,000' }] }))
  assert.ok(ok.ok && ok.value.split.length === 1 && ok.value.split[0].amount === 2000)
  const none = parseSale(sale({}))
  assert.ok(none.ok && none.value.split.length === 0, 'old screens that send no split still work')
  for (const bad of [[{ method: 'CASH', amount: 100 }], [{ method: 'CARD', amount: 0 }], [{ method: 'CARD', amount: -5 }], [{ method: 'BITCOIN', amount: 5 }], [{ method: 'CARD', amount: 'abc' }],
    [{ method: 'CARD', amount: 1 }, { method: 'CARD', amount: 2 }], [{ method: 'CARD', amount: 1 }, { method: 'JAZZCASH', amount: 1 }, { method: 'EASYPAISA', amount: 1 }]]) {
    assert.equal(parseSale(sale({ split: bad })).ok, false, JSON.stringify(bad))
  }
})

test('POS takings: a split sale adds to each method what was really paid that way; cancelled sales are left out', () => {
  const t = tillFromPayments([
    { cancelled: false, payments: [{ method: 'CASH', amount: 3000 }, { method: 'CARD', amount: 2000 }] },
    { cancelled: false, payments: [{ method: 'CASH', amount: 1000 }] },
    { cancelled: true, payments: [{ method: 'CARD', amount: 9999 }] },
  ])
  assert.equal(t.count, 2); assert.equal(t.total, 6000)
  assert.deepEqual(t.byMethod, [{ method: 'CASH', count: 2, total: 4000 }, { method: 'CARD', count: 1, total: 2000 }])
  assert.deepEqual(tillFromPayments([]), { count: 0, total: 0, byMethod: [] })
})

test('POS barcode scan: an exact code wins; otherwise only a single remaining match; never a guess', () => {
  const items = [{ id: 'a', sku: 'TEE-M', barcode: '8964000123456' }, { id: 'b', sku: 'TEE-L', barcode: null }, { id: 'c', sku: 'CAP', barcode: '8964000999999' }]
  assert.equal(scanMatch(items, items, '8964000123456')?.id, 'a')
  assert.equal(scanMatch(items, items, ' tee-l ')?.id, 'b', 'a SKU typed in any case')
  assert.equal(scanMatch(items, [items[2]], 'cap')?.id, 'c')
  assert.equal(scanMatch(items, [items[0], items[1]], 'tee'), null, 'two candidates: add nothing')
  assert.equal(scanMatch(items, [], '0000'), null); assert.equal(scanMatch(items, items, ''), null)
  const twins = [{ id: 'x', sku: 'A', barcode: '1111' }, { id: 'y', sku: 'B', barcode: '1111' }]
  assert.equal(scanMatch(twins, twins, '1111'), null, 'the same barcode on two items: the cashier must choose')
})
