/**
 * LEGACY courier adapters (Leopards). New couriers use the contract in contract.ts + factory.ts (see postex.ts).
 * Courier adapters: ONE interface, one small file per courier. The order page only talks to this
 * interface, so supporting another company later means adding one adapter + one registry entry.
 *
 * IMPORTANT (honesty note): these adapters follow each courier's merchant API as documented to
 * merchants, but they can only be proven against a real merchant account. Design rules that keep a
 * wrong guess harmless:
 *   - a parcel is recorded ONLY when the courier's reply contains a valid tracking number,
 *   - every other outcome becomes a readable error and nothing is changed,
 *   - the owner can always fall back to booking on the courier's own site and typing the number in.
 * Network access is injected (`f`) so the behaviour is tested here without calling any courier.
 */
import type { SavedFields } from '@/lib/services/registry'
import { isValidTrackingNo } from '@/lib/admin/order-rules'
import { mapCourierStatus, parseCourierDate, type TrackEvent } from '@/lib/couriers/status'

export interface BookingInput {
  orderNumber: string
  customerName: string
  /** Customer email, or '' when the store does not collect it. */
  email: string
  /** Pakistani mobile as typed locally: 03XXXXXXXXX */
  phone: string
  address: string
  city: string
  /** Cash the rider must collect (0 when fully prepaid). */
  codAmount: number
  itemCount: number
  itemsSummary: string
  notes?: string
  shipper: { name: string; phone: string; email: string }
}

export type BookingResult = { ok: true; trackingNo: string; raw: unknown } | { ok: false; error: string }
export type CheckResult = { ok: true; message: string } | { ok: false; error: string }
export type TrackResult = { ok: true; statusText: string; events: TrackEvent[] } | { ok: false; error: string }
type Fetch = typeof fetch

export interface CourierAdapter {
  key: string
  book(input: BookingInput, credentials: SavedFields, config: SavedFields, f?: Fetch): Promise<BookingResult>
  /** Harmless read-only call that proves the saved credentials work. */
  check(credentials: SavedFields, config: SavedFields, f?: Fetch): Promise<CheckResult>
  /** Read-only: asks the courier where a parcel is. Never changes anything at the courier. */
  track(trackingNo: string, credentials: SavedFields, config: SavedFields, f?: Fetch): Promise<TrackResult>
}

const TIMEOUT_MS = 20_000
const NETWORK_ERROR = 'Could not reach the courier. Nothing was booked; please try again in a moment.'
const TRACK_NETWORK_ERROR = 'Could not reach the courier. We will ask again later.'

/** One place for network + JSON handling so each adapter stays about the courier's rules only. */
async function request(f: Fetch, url: string, init: RequestInit, reading = false): Promise<{ status: number; json: unknown } | { error: string }> {
  let res: Response
  try { res = await f(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) }) } catch { return { error: reading ? TRACK_NETWORK_ERROR : NETWORK_ERROR } }
  const raw = await res.text().catch(() => '')
  try { return { status: res.status, json: JSON.parse(raw.slice(0, 200_000)) } } catch {
    return { error: `The courier sent a reply we could not read (status ${res.status}).${reading ? '' : ' Nothing was booked.'}` }
  }
}
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** Builds one tracking event; the status is read from the courier's wording. */
const makeEvent = (text: string, at: unknown, location: string | null = null): TrackEvent => ({ status: mapCourierStatus(text), text: shorten(text, 160), location: location || null, at: parseCourierDate(at) })

/**
 * Leopards tracking reply -> our shape.
 * Expected: { status: 1, packet_list: [{ booked_packet_status, "Tracking Detail": [{ Status, Reason, Activity_Date, Activity_Time, Location }] }] }
 */
export function parseLeopardsTrack(json: unknown): { statusText: string; events: TrackEvent[] } | null {
  const body = obj(json)
  if (str(body.status) !== '1') return null
  const packet = obj(arr(body.packet_list)[0])
  const statusText = str(packet.booked_packet_status)
  const events = arr(packet['Tracking Detail']).map(obj).map((d) => {
    const text = [str(d.Status), str(d.Reason)].filter(Boolean).join(': ')
    return makeEvent(text, str(d.Activity_datetime) || `${str(d.Activity_Date)} ${str(d.Activity_Time)}`.trim(), str(d.Location) || null)
  }).filter((e) => e.text)
  return statusText || events.length ? { statusText, events } : null
}
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '')
const shorten = (s: string, n = 200) => (s.length > n ? `${s.slice(0, n)}…` : s)

// ========================================================================== Leopards
const LEOPARDS = 'https://merchantapi.leopardscourier.com/api'

const form = (o: Record<string, string | number>) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString()
const FORM_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded' }

/** Leopards books by city ID, so names are looked up in Leopards' own list first. */
export function findLeopardsCity(cities: unknown, name: string): string | null {
  if (!Array.isArray(cities)) return null
  const want = name.trim().toLowerCase()
  for (const c of cities) {
    const row = obj(c)
    if (str(row.name).toLowerCase() === want && str(row.id)) return str(row.id)
  }
  return null
}

export const leopardsAdapter: CourierAdapter = {
  key: 'leopards',

  async book(i, c, cfg, f = fetch) {
    const auth = { api_key: c.apiKey, api_password: c.apiPassword }
    const list = await request(f, `${LEOPARDS}/getAllCities/format/json/`, { method: 'POST', headers: FORM_HEADERS, body: form(auth) })
    if ('error' in list) return { ok: false, error: list.error }
    const listBody = obj(list.json)
    if (str(listBody.status) !== '1') return { ok: false, error: 'Leopards rejected your API key or password. Check them in Settings > Couriers.' }
    const origin = findLeopardsCity(listBody.city_list, cfg.originCity)
    const destination = findLeopardsCity(listBody.city_list, i.city)
    if (!origin) return { ok: false, error: `Leopards does not list your pickup city “${cfg.originCity}”. Check the spelling in Settings > Couriers.` }
    if (!destination) return { ok: false, error: `Leopards does not deliver to “${i.city}” by name. Book this parcel on the Leopards website and enter its tracking number here.` }

    const r = await request(f, `${LEOPARDS}/bookPacket/format/json/`, {
      method: 'POST', headers: FORM_HEADERS,
      body: form({
        ...auth,
        booking_weight: 500,
        packet_pieces: i.itemCount,
        net_total_amount: Math.round(i.codAmount),
        order_id: i.orderNumber,
        origin_city: origin,
        destination_city: destination,
        shipment_name_eng: i.shipper.name,
        shipment_email: i.shipper.email,
        shipment_phone: i.shipper.phone,
        shipment_address: cfg.originCity,
        consignment_name_eng: i.customerName,
        consignment_email: i.email,
        consignment_phone: i.phone,
        consignment_address: i.address,
        special_instructions: shorten(`${i.itemsSummary}${i.notes ? ` | ${i.notes}` : ''}`, 250),
      }),
    })
    if ('error' in r) return { ok: false, error: r.error }
    const body = obj(r.json)
    const tn = str(body.track_number)
    if (str(body.status) === '1' && isValidTrackingNo(tn)) return { ok: true, trackingNo: tn, raw: r.json }
    return { ok: false, error: `Leopards did not accept this parcel: ${shorten(str(body.error) || str(body.message) || `status ${r.status}`)}` }
  },

  async check(c, _cfg, f = fetch) {
    const r = await request(f, `${LEOPARDS}/getAllCities/format/json/`, { method: 'POST', headers: FORM_HEADERS, body: form({ api_key: c.apiKey, api_password: c.apiPassword }) })
    if ('error' in r) return { ok: false, error: r.error }
    const body = obj(r.json)
    if (str(body.status) === '1') return { ok: true, message: 'Connected to Leopards.' }
    return { ok: false, error: 'Leopards rejected your API key or password.' }
  },

  async track(tn, c, _cfg, f = fetch) {
    const r = await request(f, `${LEOPARDS}/trackBookedPacket/format/json/`, { method: 'POST', headers: FORM_HEADERS, body: form({ api_key: c.apiKey, api_password: c.apiPassword, track_numbers: tn }) }, true)
    if ('error' in r) return { ok: false, error: r.error }
    const body = obj(r.json)
    if (str(body.status) !== '1') return { ok: false, error: shorten(`Leopards has no tracking news for ${tn}: ${str(body.error) || 'check your API key and password in Settings > Couriers'}.`) }
    const parsed = parseLeopardsTrack(r.json)
    if (!parsed) return { ok: false, error: `Leopards has no tracking news for ${tn} yet.` }
    return { ok: true, ...parsed }
  },
}

export const ADAPTERS: Record<string, CourierAdapter> = { leopards: leopardsAdapter }
