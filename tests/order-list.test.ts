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
