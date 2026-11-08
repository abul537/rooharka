import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyDiscount, describeOffer, normalizeCode, offerProblem, parseOffer, type OfferRow } from '@/lib/offers/rules'
import { invoiceLines, invoiceTotals } from '@/lib/csmi/rules'

const base: OfferRow = { code: 'LAUNCH20', title: 'Launch', percentOff: 20, periods: 3, planId: null, startsAt: null, endsAt: null, maxUses: null, usedCount: 0, isActive: true }
const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null })
const now = new Date('2026-11-10T00:00:00Z')

test('codes are normalised', () => {
  assert.equal(normalizeCode(' launch 20! '), 'LAUNCH20')
  assert.equal(normalizeCode('eid-2026'), 'EID-2026')
})

test('an offer is refused with a clear reason', () => {
  assert.equal(offerProblem(base, { planId: 'p1', now }), null)
  assert.match(offerProblem(null, { planId: 'p1', now })!, /not valid/)
  assert.match(offerProblem({ ...base, isActive: false }, { planId: 'p1', now })!, /not valid/)
  assert.match(offerProblem({ ...base, startsAt: new Date('2026-12-01') }, { planId: 'p1', now })!, /not started/)
  assert.match(offerProblem({ ...base, endsAt: new Date('2026-11-01') }, { planId: 'p1', now })!, /ended/)
  assert.match(offerProblem({ ...base, planId: 'p2' }, { planId: 'p1', now })!, /plan you chose/)
  assert.match(offerProblem({ ...base, maxUses: 5, usedCount: 5 }, { planId: 'p1', now })!, /claimed/)
  assert.equal(offerProblem({ ...base, maxUses: 5, usedCount: 4, planId: 'p1' }, { planId: 'p1', now }), null)
})

test('discount is a negative line on the plan fee only', () => {
  const lines = invoiceLines('Growth', 3000, 'MONTHLY', [{ name: 'SMS', monthlyFee: 500 }])
  const d = applyDiscount(lines, 20, 'LAUNCH20')
  assert.equal(d.length, 3)
  assert.equal(d[2].amount, -600)
  assert.equal(invoiceTotals(d).total, 2900) // 3000 + 500 - 600
  assert.equal(invoiceTotals(applyDiscount(lines, 100, 'FREE')).total, 500) // add-ons still billed
  assert.equal(applyDiscount(lines, 0, 'X'), lines)
  assert.equal(applyDiscount(lines, 250, 'X')[2].amount, -3000) // capped at 100%
  assert.equal(applyDiscount(invoiceLines('Free', 0, 'MONTHLY', []), 50, 'X').length, 1)
})

test('describing an offer in plain words', () => {
  assert.equal(describeOffer({ percentOff: 20, periods: 3 }), '20% off the plan fee for the first 3 months')
  assert.equal(describeOffer({ percentOff: 100, periods: 1 }), 'Free plan for the first month')
  assert.equal(describeOffer({ percentOff: 15, periods: 1 }, 'YEARLY'), '15% off the plan fee for the first year')
})

test('the CSMI offer form validates every field', () => {
  const ok = parseOffer(form({ code: 'eid 25', title: 'Eid offer', percentOff: '25', periods: '2', startsAt: '2026-11-10', endsAt: '2026-11-30', maxUses: '50', isActive: 'on' }))
  assert.equal(ok.ok, true)
  if (ok.ok) { assert.equal(ok.value.code, 'EID25'); assert.equal(ok.value.maxUses, 50); assert.equal(ok.value.endsAt?.toISOString(), '2026-11-30T18:59:59.000Z') }
  const bad = (o: Record<string, string>) => parseOffer(form({ code: 'EID25', title: 'Eid offer', percentOff: '25', periods: '2', ...o })).ok
  assert.equal(bad({ code: 'a' }), false)
  assert.equal(bad({ title: 'x' }), false)
  assert.equal(bad({ percentOff: '0' }), false)
  assert.equal(bad({ percentOff: '101' }), false)
  assert.equal(bad({ periods: '0' }), false)
  assert.equal(bad({ periods: '37' }), false)
  assert.equal(bad({ startsAt: '2026-13-45' }), false)
  assert.equal(bad({ startsAt: '2026-12-01', endsAt: '2026-11-01' }), false)
  assert.equal(bad({ maxUses: '0' }), false)
  assert.equal(bad({}), true)
})
