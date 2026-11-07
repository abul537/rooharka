import { test } from 'node:test'
import assert from 'node:assert/strict'
import { approvalLabel, cleanReason, decisionMessage, reasonProblem, serviceRequestOutcome, serviceUsable, shopGate, whatsappLink } from '@/lib/approvals/rules'

test('a refusal needs a real reason', () => {
  assert.ok(reasonProblem(''))
  assert.ok(reasonProblem('  no ')) // too short after trimming
  assert.ok(reasonProblem('x'.repeat(301)))
  assert.equal(reasonProblem('Incomplete business details'), null)
  assert.equal(cleanReason('  too   many\n spaces  '), 'too many spaces')
})

test('shop gate follows the approval state', () => {
  assert.equal(shopGate('APPROVED'), 'open')
  assert.equal(shopGate('PENDING'), 'pending')
  assert.equal(shopGate('DENIED'), 'denied')
})

test('a service works only when switched on and approved', () => {
  assert.equal(serviceUsable(null), false)
  assert.equal(serviceUsable({ enabled: true, approval: 'APPROVED' }), true)
  assert.equal(serviceUsable({ enabled: true, approval: 'PENDING' }), false)
  assert.equal(serviceUsable({ enabled: true, approval: 'DENIED' }), false)
  assert.equal(serviceUsable({ enabled: false, approval: 'APPROVED' }), false)
})

test('turning a service on: open, request, or blocked with the reason', () => {
  assert.deepEqual(serviceRequestOutcome({ requiresApproval: false, current: null }), { kind: 'allowed' })
  assert.deepEqual(serviceRequestOutcome({ requiresApproval: true, current: null }), { kind: 'request' })
  assert.deepEqual(serviceRequestOutcome({ requiresApproval: true, current: 'PENDING' }), { kind: 'request' })
  assert.deepEqual(serviceRequestOutcome({ requiresApproval: true, current: 'APPROVED' }), { kind: 'allowed' })
  const b = serviceRequestOutcome({ requiresApproval: false, current: 'DENIED', note: 'Fake-order complaints' })
  assert.equal(b.kind, 'blocked')
  assert.match((b as { message: string }).message, /Fake-order complaints/)
})

test('labels and messages always carry the reason on a refusal', () => {
  assert.match(approvalLabel('DENIED', 'Missing CNIC'), /Missing CNIC/)
  assert.match(approvalLabel('PENDING'), /Waiting/)
  const no = decisionMessage({ brand: 'Rooharka', name: 'Ali Khan', subject: 'shop', what: 'your shop going live', approved: false, reason: 'No products yet' })
  assert.match(no, /Hello Ali/); assert.match(no, /No products yet/); assert.match(no, /reply/)
  const yes = decisionMessage({ brand: 'Rooharka', name: 'Ali', subject: 'shop', what: 'your shop', approved: true })
  assert.doesNotMatch(yes, /Reason/)
})

test('whatsapp link: digits only, refuses nonsense, encodes the text', () => {
  const l = whatsappLink('+92 300-1234567', 'Hi & bye')
  assert.equal(l, 'https://wa.me/923001234567?text=Hi%20%26%20bye')
  assert.equal(whatsappLink('abc', 'x'), null)
  assert.equal(whatsappLink(null, 'x'), null)
})
