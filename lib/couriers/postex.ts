/**
 * PostEx adapter. THIS IS THE ONLY FILE that knows PostEx's endpoints, field names, payload shapes and status
 * wording. If PostEx changes its API, only this file is edited.
 *
 * HONESTY NOTE: written from PostEx's merchant API as documented to merchants. Field names (especially the
 * cancel call and the webhook body) MUST be confirmed against the official PostEx docs / sandbox for your
 * merchant account before launch; the tolerant parsing below keeps a wrong guess harmless: nothing is recorded
 * unless the reply contains a usable tracking number, and an unrecognised status is ignored, never stored.
 */
import { isValidTrackingNo } from '@/lib/admin/order-rules'
import { parseCourierDate } from '@/lib/couriers/status'
import { CourierError, STATUS_TEXT, type CourierAdapter, type Fetch, type NormalizedStatus, type TrackingEvent, type WebhookUpdate } from '@/lib/couriers/contract'

const BASE = 'https://api.postex.pk/services/integration/api/order'
const TIMEOUT_MS = 20_000

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '')
const shorten = (s: string, n = 200) => (s.length > n ? `${s.slice(0, n)}…` : s)

// ------------------------------------------------------------------ PostEx wording -> the one vocabulary
const EXACT: Record<string, NormalizedStatus> = {
  'unbooked': 'label_created', 'booked': 'label_created', 'out for pickup': 'label_created',
  'picked by postex': 'picked_up',
  'postex warehouse': 'in_transit', 'enroute': 'in_transit', 'en-route': 'in_transit', 'in transit': 'in_transit',
  'out for delivery': 'out_for_delivery',
  'delivered': 'delivered',
  'attempted': 'exception', 'delivery under review': 'exception', 'returned': 'exception', 'out for return': 'exception',
  'un-assigned by me': 'exception', 'expired': 'exception', 'cancelled': 'exception', 'canceled': 'exception',
}

/** PostEx's status wording -> our vocabulary, or null when we do not recognise it (then it is ignored, never stored). */
export function normalizePostexStatus(raw: unknown): NormalizedStatus | null {
  const t = str(raw).toLowerCase().replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return null
  if (EXACT[t]) return EXACT[t]
  // Wording we have not seen exactly: most specific meaning first ("returned" beats "delivered").
  if (/\b(return|rto|attempt|cancel|expire|under review|undeliver|refus)/.test(t)) return 'exception'
  if (/\bout for delivery\b/.test(t)) return 'out_for_delivery'
  if (/\bdelivered\b/.test(t)) return 'delivered'
  if (/\b(warehouse|en ?route|transit|hub|dispatch)\b/.test(t)) return 'in_transit'
  if (/\b(picked)\b/.test(t)) return 'picked_up'
  if (/\b(booked|unbooked|pickup)\b/.test(t)) return 'label_created'
  return null
}

const event = (status: NormalizedStatus, at: unknown, location?: unknown): TrackingEvent => ({
  status, description: STATUS_TEXT[status], location: str(location) || null, occurredAt: parseCourierDate(at),
})

// ------------------------------------------------------------------ one place for network + JSON handling
type Reply = { status: number; json: unknown }
/** `sending` = a booking request: if it dies half way we cannot know whether PostEx created the parcel. */
async function call(f: Fetch, url: string, init: RequestInit, sending: boolean): Promise<Reply> {
  let res: Response
  try { res = await f(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) }) } catch {
    throw sending
      ? new CourierError('unknown', 'PostEx did not answer in time. The parcel may or may not have been booked, so it will not be booked again automatically.')
      : new CourierError('unreachable', 'Could not reach PostEx. Please try again in a moment.')
  }
  const raw = await res.text().catch(() => '')
  let json: unknown = null
  try { json = JSON.parse(raw.slice(0, 200_000)) } catch { /* handled below */ }
  if (res.status >= 500 && sending) throw new CourierError('unknown', 'PostEx had a problem while booking. The parcel may or may not have been booked, so it will not be booked again automatically.')
  if (json === null && res.status !== 401 && res.status !== 403) {
    throw new CourierError(sending ? 'rejected' : 'unreachable', `PostEx sent a reply we could not read (status ${res.status}).`)
  }
  return { status: res.status, json }
}
const authFailed = (r: Reply) => r.status === 401 || r.status === 403
const AUTH = 'PostEx did not accept the token. Please check it in your PostEx merchant portal and connect again.'
const headers = (token: string) => ({ token, 'Content-Type': 'application/json' })

export const postexAdapter: CourierAdapter = {
  provider: 'postex',

  async createShipment(o, c, f = fetch) {
    const r = await call(f, `${BASE}/v3/create-order`, {
      method: 'POST', headers: headers(c.token),
      body: JSON.stringify({
        cityName: o.customer.city,
        customerName: o.customer.name,
        customerPhone: o.customer.phone,
        deliveryAddress: o.customer.address,
        invoiceDivision: 1,
        invoicePayment: String(Math.round(o.codAmount)),
        items: o.itemCount,
        orderDetail: shorten(o.itemsSummary, 250),
        orderRefNumber: o.reference, // the idempotency key: PostEx also sees which order this is
        orderType: 'Normal',
        transactionNotes: shorten(o.notes ?? '', 200),
        // No pickupAddressCode: PostEx uses the merchant's default pickup address (pickup management is out of scope).
      }),
    }, true)
    if (authFailed(r)) throw new CourierError('auth', AUTH)
    const body = obj(r.json)
    const tn = str(obj(body.dist).trackingNumber)
    if (str(body.statusCode) === '200' && isValidTrackingNo(tn)) return { trackingNumber: tn, shipmentId: tn }
    throw new CourierError('rejected', `PostEx did not accept this parcel: ${shorten(str(body.statusMessage) || `status ${r.status}`)}`)
  },

  async track(tn, c, f = fetch) {
    const r = await call(f, `${BASE}/v1/track-order/${encodeURIComponent(tn)}`, { headers: { token: c.token } }, false)
    if (authFailed(r)) throw new CourierError('auth', AUTH)
    const body = obj(r.json)
    if (str(body.statusCode) !== '200') throw new CourierError('rejected', `PostEx has no tracking news for this parcel yet.`)
    const dist = obj(body.dist)
    const out: TrackingEvent[] = []
    for (const h of arr(dist.transactionStatusHistory).map(obj)) {
      const s = normalizePostexStatus(h.transactionStatusMessage)
      if (s) out.push(event(s, h.updatedAt))
    }
    // The current status is the newest fact: make sure it is present even if the history is empty or older.
    const now = normalizePostexStatus(dist.transactionStatus)
    if (now && out[out.length - 1]?.status !== now) out.push(event(now, null))
    return out.sort((a, b) => (a.occurredAt?.getTime() ?? Infinity) - (b.occurredAt?.getTime() ?? Infinity))
  },

  async cancelShipment(id, c, f = fetch) {
    const r = await call(f, `${BASE}/v1/cancel-order`, { method: 'PUT', headers: headers(c.token), body: JSON.stringify({ trackingNumber: id }) }, false)
    if (authFailed(r)) throw new CourierError('auth', AUTH)
    const body = obj(r.json)
    if (str(body.statusCode) !== '200') throw new CourierError('rejected', `PostEx did not cancel this parcel: ${shorten(str(body.statusMessage) || `status ${r.status}`)}`)
  },

  async verifyCredentials(c, f = fetch) {
    const r = await call(f, `${BASE}/v1/get-operational-city`, { headers: { token: c.token } }, false)
    if (authFailed(r)) throw new CourierError('auth', AUTH)
    if (!(r.status >= 200 && r.status < 300 && str(obj(r.json).statusCode) === '200')) throw new CourierError('rejected', 'PostEx gave an unexpected answer.')
  },

  /** Tolerant on purpose (field names must be confirmed in PostEx's webhook docs): looks for the usual spellings. */
  parseWebhook(payload) {
    const b = obj(payload)
    const d = { ...b, ...obj(b.dist), ...obj(b.data) }
    const tn = str(d.trackingNumber) || str(d.trackingNo) || str(d.cn)
    const status = normalizePostexStatus(d.transactionStatus ?? d.orderStatus ?? d.status ?? d.transactionStatusMessage)
    if (!tn || !isValidTrackingNo(tn) || !status) return null
    return { trackingNumber: tn, event: event(status, d.updatedAt ?? d.statusDate ?? d.dateTime ?? d.timestamp, d.location ?? d.city) } satisfies WebhookUpdate
  },
}
