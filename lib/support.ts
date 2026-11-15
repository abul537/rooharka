/**
 * SUPPORT: a store owner writes to the platform from their dashboard, the platform answers in CSMI, and both see
 * the whole conversation. The rules (pure).
 */
export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_STORE', 'RESOLVED', 'CLOSED'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]
export const TICKET_LABEL: Record<TicketStatus, string> = { OPEN: 'New', IN_PROGRESS: 'Being looked at', WAITING_ON_STORE: 'Waiting for your reply', RESOLVED: 'Answered', CLOSED: 'Closed' }
export const TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]
export const PRIORITY_LABEL: Record<TicketPriority, string> = { LOW: 'A question, no hurry', NORMAL: 'Normal', HIGH: 'It affects my sales', URGENT: 'My shop is not working' }
export const MAX_OPEN_TICKETS = 10
export const SUBJECT_MAX = 120, MESSAGE_MAX = 4000
export const isOpen = (s: string) => s !== 'CLOSED' && s !== 'RESOLVED'

const line = (v: unknown, max: number) => (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
/** Message text keeps its line breaks; everything else unprintable goes. It is always shown as plain text. */
const text = (v: unknown, max: number) => (typeof v === 'string' ? v : '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max)

export function parseTicket(get: (k: string) => unknown): { ok: true; value: { subject: string; body: string; priority: TicketPriority } } | { ok: false; error: string } {
  const subject = line(get('subject'), SUBJECT_MAX), body = text(get('body'), MESSAGE_MAX)
  if (subject.length < 4) return { ok: false, error: 'Write a short subject (what is it about?).' }
  if (body.length < 10) return { ok: false, error: 'Describe the problem in a sentence or two, so we can help quickly.' }
  return { ok: true, value: { subject, body, priority: TICKET_PRIORITIES.find((p) => p === get('priority')) ?? 'NORMAL' } }
}
export function parseReply(raw: unknown): string | null {
  const body = text(raw, MESSAGE_MAX)
  return body.length >= 2 ? body : null
}
/** What a reply does to the ticket: an answer from the platform waits on the store, and the other way round. */
export const statusAfterReply = (fromPlatform: boolean): TicketStatus => (fromPlatform ? 'WAITING_ON_STORE' : 'OPEN')
