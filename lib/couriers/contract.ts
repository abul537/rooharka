/**
 * THE COURIER CONTRACT. Order and fulfilment code talks to couriers ONLY through this file's `CourierAdapter`;
 * it never imports a courier's own file. Four things make up the contract:
 *   1. this interface,
 *   2. the credential vault (lib/couriers/vault.ts),
 *   3. the webhook router (app/api/webhooks/[courier]/[tenantId]) and
 *   4. ONE normalized status vocabulary (below). Courier wording is turned into it inside the adapter and never stored.
 *
 * Adding a courier = one adapter file + one case in factory.ts + one tiny webhook route file. No change to order
 * code and no change to the database.
 */
import type { ShipmentStatus } from '@/lib/couriers/status'

// ------------------------------------------------------------------ the one status vocabulary
export const NORMALIZED_STATUSES = ['label_created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'exception'] as const
export type NormalizedStatus = (typeof NORMALIZED_STATUSES)[number]

/**
 * What is saved in the database for each normalized status. The database column is the existing ShipmentStatus
 * enum, so the courier layer needs no schema change; this table is the only bridge between the two.
 */
export const STORED_STATUS: Record<NormalizedStatus, ShipmentStatus> = {
  label_created: 'CREATED', picked_up: 'PICKED_UP', in_transit: 'IN_TRANSIT', out_for_delivery: 'OUT_FOR_DELIVERY', delivered: 'DELIVERED', exception: 'FAILED',
}
/** Our own plain words for each status (shown to the owner and saved as the event text, instead of the courier's wording). */
export const STATUS_TEXT: Record<NormalizedStatus, string> = {
  label_created: 'Parcel booked', picked_up: 'Picked up from the shop', in_transit: 'On its way', out_for_delivery: 'Out for delivery', delivered: 'Delivered', exception: 'Delivery attempt failed',
}
export const isNormalizedStatus = (v: unknown): v is NormalizedStatus => (NORMALIZED_STATUSES as readonly string[]).includes(v as string)

// ------------------------------------------------------------------ what order code hands to an adapter
export interface ShipmentOrder {
  /** The order's reference number. It is ALSO the idempotency key: one reference = one parcel. */
  reference: string
  customer: { name: string; email: string; /** Pakistani mobile as typed locally: 03XXXXXXXXX */ phone: string; address: string; city: string }
  /** Cash the rider must collect (0 when prepaid). */
  codAmount: number
  itemCount: number
  itemsSummary: string
  notes?: string
}

/** The store's secret for one courier. Opaque to everything except the adapter. Never logged, never sent to a browser. */
export interface CourierCredentials { token: string }

export interface ShipmentResult {
  trackingNumber: string
  /** What `cancelShipment` needs. For some couriers this is the tracking number itself. */
  shipmentId: string
}

export interface TrackingEvent {
  status: NormalizedStatus
  /** Always OUR wording (STATUS_TEXT), never the courier's. */
  description: string
  location: string | null
  occurredAt: Date | null
}

/** A webhook, already translated: which parcel and what happened. */
export interface WebhookUpdate { trackingNumber: string; event: TrackingEvent }

// ------------------------------------------------------------------ errors
/**
 * `message` is always safe to show a store owner (no endpoints, no field names, no secrets).
 *  - auth:      the courier did not accept the token
 *  - rejected:  the courier answered and refused this request (nothing was created)
 *  - unreachable: could not talk to the courier at all (only used where nothing could have been created)
 *  - unknown:   we sent a booking and do not know whether it was created (timeout, dropped connection, courier 5xx)
 */
export type CourierErrorKind = 'auth' | 'rejected' | 'unreachable' | 'unknown' | 'unsupported'
export class CourierError extends Error {
  kind: CourierErrorKind
  constructor(kind: CourierErrorKind, message: string) { super(message); this.kind = kind; this.name = 'CourierError' }
}
export const isCourierError = (e: unknown): e is CourierError => e instanceof CourierError

// ------------------------------------------------------------------ the interface
export type Fetch = typeof fetch

export interface CourierAdapter {
  readonly provider: string
  /** Books the parcel and returns its tracking number. Throws CourierError. */
  createShipment(order: ShipmentOrder, credentials: CourierCredentials, f?: Fetch): Promise<ShipmentResult>
  /** Where is it now? Oldest first. Read-only. Throws CourierError. */
  track(trackingNumber: string, credentials: CourierCredentials, f?: Fetch): Promise<TrackingEvent[]>
  cancelShipment(shipmentId: string, credentials: CourierCredentials, f?: Fetch): Promise<void>
  /** Harmless read-only call proving the token works (used by the "Connect" button). Throws CourierError. */
  verifyCredentials(credentials: CourierCredentials, f?: Fetch): Promise<void>
  /** Translates a webhook body from this courier, or null when it is not a parcel update we understand. */
  parseWebhook(payload: unknown): WebhookUpdate | null
}
