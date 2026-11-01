/**
 * Turning what a courier SAYS ("Out for delivery", "RTO initiated"...) into our own shipment and order
 * statuses. Pure functions, no database, so every rule is unit-tested.
 *
 * Design rules that keep a wrong guess harmless:
 *  - the text is matched by keywords, most specific meaning first; unknown wording maps to nothing (no change),
 *  - a status never goes backwards, and a finished parcel (delivered / returned) never changes again,
 *  - the ORDER only moves along steps the order rules already allow, and never leaves delivered/returned/cancelled.
 */
import { NEXT_STATUSES, type OrderStatus } from '@/lib/admin/order-rules'

export type ShipmentStatus = 'CREATED' | 'PICKED_UP' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED' | 'RETURNED'

/** Courier wording -> our status, or null when the wording is not recognised. */
export function mapCourierStatus(raw: string | null | undefined): ShipmentStatus | null {
  const t = (raw ?? '').toLowerCase().replace(/[_\-/]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return null
  // Returns first: "Return delivered to shipper" is a RETURN, not a delivery to the customer.
  if (/\b(return(ed|ing)?|rto|rts|back to (shipper|origin|sender)|sent back)\b/.test(t) && !/\b(return(ed)? (requested|cancel)|no return)\b/.test(t)) return 'RETURNED'
  if (/\b(undelivered|not delivered|delivery (failed|unsuccessful|attempt)|attempt(ed)?( failed)?|refused|rejected|consignee (not|unavailable)|customer (not|unavailable|refused)|address (incorrect|not found)|no one (available|at home))\b/.test(t)) return 'FAILED'
  if (/\bdelivered\b/.test(t)) return 'DELIVERED'
  if (/\b(out for delivery|with (the )?(delivery )?(rider|courier|agent)|rider assigned|on (the )?way to (you|customer|consignee)|delivery in progress|dispatched for delivery)\b/.test(t)) return 'OUT_FOR_DELIVERY'
  if (/\b(in transit|en ?route|arrived|departed|received at|reached|at (the )?(hub|warehouse|facility|station)|(hub|warehouse|station|facility)|forwarded|dispatched|on (its )?way|moved|route)\b/.test(t)) return 'IN_TRANSIT'
  if (/\b(picked up|pickup (done|complete)|collected from|received from (shipper|merchant))\b/.test(t)) return 'PICKED_UP'
  if (/\b(booked|unbooked|pending|created|order (placed|received)|awaiting|ready for pickup|not picked)\b/.test(t)) return 'CREATED'
  return null
}

const RANK: Record<ShipmentStatus, number> = { CREATED: 0, PICKED_UP: 1, IN_TRANSIT: 2, OUT_FOR_DELIVERY: 3, FAILED: 3, DELIVERED: 5, RETURNED: 5 }
export const isFinished = (s: ShipmentStatus) => s === 'DELIVERED' || s === 'RETURNED'

/** May the parcel's status change from `current` to `next`? Forwards only, and never after it is finished. */
export function shouldAdvance(current: ShipmentStatus, next: ShipmentStatus): boolean {
  if (current === next || isFinished(current)) return false
  return RANK[next] >= RANK[current]
}

/** The order status a shipment status calls for, or null when the order should stay as it is. */
export function orderTargetFor(shipment: ShipmentStatus, orderStatus: OrderStatus): OrderStatus | null {
  const target: OrderStatus | null = shipment === 'OUT_FOR_DELIVERY' ? 'OUT_FOR_DELIVERY' : shipment === 'DELIVERED' ? 'DELIVERED' : shipment === 'RETURNED' ? 'RETURNED' : null
  if (!target || target === orderStatus) return null
  // Only ever move an order that is on its way; delivered/returned/cancelled orders are the owner's to change.
  if (orderStatus !== 'SHIPPED' && orderStatus !== 'OUT_FOR_DELIVERY') return null
  return NEXT_STATUSES[orderStatus].includes(target) ? target : null
}

export interface TrackEvent { status: ShipmentStatus | null; text: string; location: string | null; at: Date | null }

/**
 * The parcel's current status from a tracking reply: the courier's own "current status" wording wins; if that is
 * not recognised, the newest recognised event decides. `events` may arrive in any order.
 */
export function currentStatus(statusText: string | null, events: TrackEvent[]): ShipmentStatus | null {
  const direct = mapCourierStatus(statusText)
  if (direct) return direct
  const dated = events.filter((e) => e.status && e.at).sort((a, b) => b.at!.getTime() - a.at!.getTime())
  if (dated.length) return dated[0].status
  const best = events.filter((e) => e.status).sort((a, b) => RANK[b.status!] - RANK[a.status!])[0]
  return best?.status ?? null
}

/** Key used to avoid saving the same courier event twice. */
export const eventKey = (e: { status: string | null; text: string; at: Date | null }) => `${e.status ?? ''}|${e.at ? e.at.getTime() : ''}|${e.text.trim().toLowerCase()}`

/** Courier dates arrive in many shapes. Returns null rather than guessing wrong. Accepts ISO, "2026-10-21 14:30:00", "21-10-2026 14:30" (Pakistan time). */
export function parseCourierDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const s = v.trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(s)
  let y: number, mo: number, d: number, h = 0, mi = 0, se = 0, tz: string | undefined
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; h = +(m[4] ?? 0); mi = +(m[5] ?? 0); se = +(m[6] ?? 0); tz = m[7] }
  else {
    m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s)
    if (!m) return null
    d = +m[1]; mo = +m[2]; y = +m[3]; h = +(m[4] ?? 0); mi = +(m[5] ?? 0); se = +(m[6] ?? 0)
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59 || y < 2000) return null
  if (new Date(Date.UTC(y, mo - 1, d)).getUTCDate() !== d) return null // 31 February and friends
  let ms = Date.UTC(y, mo - 1, d, h, mi, se)
  if (tz && tz !== 'Z') { const sign = tz[0] === '-' ? -1 : 1; const digits = tz.slice(1).replace(':', ''); ms -= sign * (+digits.slice(0, 2) * 60 + +digits.slice(2)) * 60_000 }
  else if (!tz) ms -= 5 * 3_600_000 // no zone given: couriers in Pakistan report Pakistan time (UTC+5)
  return new Date(ms)
}
