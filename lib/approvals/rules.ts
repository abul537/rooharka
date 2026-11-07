/**
 * Approval rules, as pure functions (no database) so every decision is unit-tested.
 * Three things need the platform owner's yes: a new account (sign-up queue), a store's shop going live to customers,
 * and a store using a service. A "no" ALWAYS carries a reason the store owner can read.
 */
export type Approval = 'APPROVED' | 'PENDING' | 'DENIED'
export const MIN_REASON = 5
export const MAX_REASON = 300

/** A reason is required for every refusal: clear enough to be useful, short enough to send as a message. */
export function reasonProblem(reason: string): string | null {
  const r = reason.trim()
  if (r.length < MIN_REASON) return `Write a short reason (at least ${MIN_REASON} characters). The store owner will read it.`
  if (r.length > MAX_REASON) return `Keep the reason to ${MAX_REASON} characters or fewer.`
  return null
}
export const cleanReason = (reason: string) => reason.trim().replace(/\s+/g, ' ').slice(0, MAX_REASON)

/** What customers see at the shop address. Suspended/cancelled stores are handled before this (no shop at all). */
export type ShopGate = 'open' | 'pending' | 'denied'
export const shopGate = (approval: Approval): ShopGate => (approval === 'APPROVED' ? 'open' : approval === 'PENDING' ? 'pending' : 'denied')

/** A service works only when the store switched it on AND the owner has not held or blocked it. */
export const serviceUsable = (row: { enabled: boolean; approval: Approval } | null | undefined) => !!row && row.enabled && row.approval === 'APPROVED'

/**
 * What happens when a store owner saves a service with "on" ticked.
 *  - owner blocked it earlier: refused, with the reason;
 *  - catalog says approval is required and it is not yet approved: stored as a request (off until approved);
 *  - otherwise: works at once.
 */
export type ServiceRequest =
  | { kind: 'allowed' }
  | { kind: 'request' }
  | { kind: 'blocked'; message: string }
export function serviceRequestOutcome(o: { requiresApproval: boolean; current: Approval | null; note?: string | null }): ServiceRequest {
  if (o.current === 'DENIED') return { kind: 'blocked', message: `This service is not available for your store.${o.note ? ` Reason: ${o.note}` : ''}` }
  if (o.requiresApproval && o.current !== 'APPROVED') return { kind: 'request' }
  return { kind: 'allowed' }
}

/** The line shown to the store owner next to a service or on the shop banner. */
export function approvalLabel(state: Approval, note?: string | null): string {
  if (state === 'APPROVED') return 'Approved'
  if (state === 'PENDING') return 'Waiting for the platform owner to approve'
  return `Not approved${note ? `: ${note}` : ''}`
}

/** A ready-to-open WhatsApp message (wa.me), for when email is not set up. Digits only in the number. */
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(text.slice(0, 900))}`
}

export type DecisionSubject = 'shop' | 'service' | 'signup'
/** The message sent (email body or WhatsApp text) after a decision. Plain words, the reason always included on a refusal. */
export function decisionMessage(o: { brand: string; name: string; subject: DecisionSubject; what: string; approved: boolean; reason?: string }): string {
  const first = o.name.trim().split(/\s+/)[0] || 'there'
  const head = o.approved
    ? `Good news: ${o.what} has been approved.`
    : `We could not approve ${o.what} at this time.${o.reason ? ` Reason: ${o.reason}` : ''}`
  const tail = o.approved ? '' : ' If you think this is a mistake or you have fixed the issue, reply to this message and we will review it again.'
  return `Hello ${first}, ${head}${tail} - ${o.brand}`
}
