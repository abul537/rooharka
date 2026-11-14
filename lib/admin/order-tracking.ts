/**
 * ORDER TRACKING (the dashboard page): the rules. Pure, no database, so they are unit-tested.
 *
 * The page is the owner's side of the customer's "Track order" page: each change of status made here is what the
 * customer sees there, with an optional note in the owner's own words.
 */
import { label, type OrderStatus } from '@/lib/admin/order-rules'

/** The stages an order is worked through, in order, then the three ways it ends. */
export const TRACK_ACTIVE = ['PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY'] as const
export const TRACK_DONE = ['DELIVERED', 'RETURNED', 'CANCELLED'] as const
export const TRACK_STAGES = [...TRACK_ACTIVE, ...TRACK_DONE] as const
export type TrackStage = (typeof TRACK_STAGES)[number]

/** What the owner should do with the orders in each stage. */
export const STAGE_TODO: Record<TrackStage, string> = {
  PLACED: 'New orders. Check each one (call the customer if you wish), then confirm it.',
  CONFIRMED: 'Confirmed. Pack the products, then mark the order packed.',
  PACKED: 'Packed and waiting for the courier. Mark shipped when the parcel is handed over.',
  SHIPPED: 'With the courier. Mark out for delivery or delivered when you hear from them.',
  OUT_FOR_DELIVERY: 'The rider has the parcel. Mark delivered once the customer receives it.',
  DELIVERED: 'Finished: the customer has the parcel.',
  RETURNED: 'Came back from the customer or the courier.',
  CANCELLED: 'Cancelled before dispatch.',
}
/** After this many hours in a stage, an order is flagged as waiting too long. */
export const LATE_AFTER_HOURS: Record<(typeof TRACK_ACTIVE)[number], number> = { PLACED: 24, CONFIRMED: 24, PACKED: 24, SHIPPED: 120, OUT_FOR_DELIVERY: 48 }
export const TRACK_PAGE_SIZE = 40
export const NOTE_MAX = 300

const one = (v: unknown) => String(Array.isArray(v) ? v[0] ?? '' : v ?? '').trim()
/** The stage in the address; anything unknown opens "new orders". */
export const trackStage = (raw: unknown): TrackStage => TRACK_STAGES.find((s) => s === one(raw).toUpperCase()) ?? 'PLACED'
/** The search words in the address (order number, tracking code, name or phone). */
export const trackSearch = (raw: unknown): string => one(raw).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 60)
export const trackHref = (stage: TrackStage, q = '') => `/admin/order-tracking${q ? `?q=${encodeURIComponent(q)}` : stage === 'PLACED' ? '' : `?stage=${stage}`}`

/**
 * When an order arrived at its current step. `history` = its latest lines, newest first; notes sent without a
 * change of step carry the same status, so they do not restart the clock.
 */
export function stageSince(status: string, history: { status: string; createdAt: Date }[], placedAt: Date): Date {
  let since: Date | null = null
  for (const h of history) { if (h.status !== status) break; since = h.createdAt }
  return since ?? history[0]?.createdAt ?? placedAt
}

/** "40 min", "5 h", "3 days": how long an order has been in its stage. */
export function waited(since: Date, now = new Date()): string {
  const min = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60_000))
  if (min < 60) return `${min} min`
  if (min < 48 * 60) return `${Math.floor(min / 60)} h`
  return `${Math.floor(min / 1440)} days`
}
export function isLate(status: string, since: Date, now = new Date()): boolean {
  const limit = LATE_AFTER_HOURS[status as keyof typeof LATE_AFTER_HOURS]
  return limit !== undefined && now.getTime() - since.getTime() > limit * 3600_000
}

/**
 * A note the customer will read on their tracking page: plain text, one line, at most 300 characters.
 * Returns null when there is nothing left to say.
 */
export function parseCustomerNote(raw: unknown): string | null {
  const text = (typeof raw === 'string' ? raw : '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX).trim()
  return text || null
}

/** Ready-made notes for each step, so the owner can tap instead of type. They can be edited before sending. */
export const NOTE_IDEAS: Partial<Record<OrderStatus, string[]>> = {
  CONFIRMED: ['Thank you! Your order is confirmed and will be packed soon.'],
  PACKED: ['Your order is packed and waiting for the courier.'],
  SHIPPED: ['Your parcel has been handed to the courier.', 'Shipped. It usually arrives in 2 to 4 working days.'],
  OUT_FOR_DELIVERY: ['The rider is on the way. Please keep your phone on.'],
  DELIVERED: ['Delivered. Thank you for shopping with us!'],
  RETURNED: ['The parcel came back to us. Please contact us if you still want it.'],
}

/** A Pakistani mobile number as WhatsApp wants it (923001234567), or null if it is not one. */
export function whatsappNumber(phone: string): string | null {
  const d = phone.replace(/\D/g, '')
  const local = d.startsWith('0092') ? d.slice(4) : d.startsWith('92') ? d.slice(2) : d.startsWith('0') ? d.slice(1) : d
  return /^3\d{9}$/.test(local) ? `92${local}` : null
}
/**
 * A link that opens the OWNER'S OWN WhatsApp with a message to the customer already written (nothing is sent until
 * the owner presses send, and no paid service is involved). null when the phone number is not a mobile number.
 */
export function whatsappUpdate(o: { phone: string; name: string; number: string; status: string; trackingCode: string; note?: string | null; store: string }): string | null {
  const to = whatsappNumber(o.phone)
  if (!to) return null
  const first = o.name.trim().split(/\s+/)[0] || 'there'
  const text = `Assalam o Alaikum ${first}, your order #${o.number} from ${o.store} is now: ${label(o.status)}.${o.note && o.note !== label(o.status) ? ` ${o.note}` : ''} Your tracking code is ${o.trackingCode}.`
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`
}
