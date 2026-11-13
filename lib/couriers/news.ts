/**
 * Saving what a courier said about a parcel. Shared by the scheduled check and the webhook, so both behave the same:
 * events are saved once, the parcel only moves forward, and the ORDER follows only if the owner switched that on.
 * Everything saved here is OUR vocabulary (see contract.ts); courier wording never reaches the database.
 */
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { AdminError, changeOrderStatus } from '@/lib/admin/orders'
import type { OrderStatus } from '@/lib/admin/order-rules'
import type { CourierConfig } from '@/lib/couriers/config'
import { eventKey, orderTargetFor, shouldAdvance, type ShipmentStatus, type TrackEvent } from '@/lib/couriers/status'

const MAX_EVENTS_SAVED = 40

export interface ShipmentRef { id: string; courier: string; trackingNo: string; status: ShipmentStatus; orderId: string; orderStatus: OrderStatus; storeId: string }

/** Saves events we have not saved before. Returns how many were new. */
export async function saveEvents(shipmentId: string, events: TrackEvent[]): Promise<number> {
  const existing = await db.shipmentEvent.findMany({ where: { shipmentId }, select: { status: true, description: true, occurredAt: true } })
  const known = new Set(existing.map((e: { status: string; description: string | null; occurredAt: Date }) => eventKey({ status: e.status, text: e.description ?? '', at: e.occurredAt })))
  const fresh = events.filter((e) => e.status && e.at && !known.has(eventKey(e))).slice(0, MAX_EVENTS_SAVED)
  if (fresh.length) await db.shipmentEvent.createMany({ data: fresh.map((e) => ({ shipmentId, status: e.status!, description: e.text, location: e.location, occurredAt: e.at! })) })
  return fresh.length
}

/** Moves the parcel forward if `seen` is ahead of it. Returns the new status, or null when nothing changed. */
export async function advanceShipment(ref: ShipmentRef, seen: ShipmentStatus | null, now = new Date()): Promise<ShipmentStatus | null> {
  if (!seen || !shouldAdvance(ref.status, seen)) return null
  // Compare-and-set on the old status: two updates at once (webhook + check) cannot step on each other.
  const res = await db.shipment.updateMany({ where: { id: ref.id, status: ref.status }, data: { status: seen, syncError: null, ...(seen === 'DELIVERED' ? { deliveredAt: now } : {}) } })
  return res.count ? seen : null
}

/** The order follows the parcel only when the owner asked for that. Returns the order's new status, if it moved. */
export async function followOrder(ref: ShipmentRef, status: ShipmentStatus, config: CourierConfig): Promise<OrderStatus | null> {
  if (!config.autoUpdate) return null
  const target = orderTargetFor(status, ref.orderStatus)
  if (!target) return null
  try {
    const done = await changeOrderStatus({ storeId: ref.storeId, id: null }, ref.orderId, target)
    await audit({ storeId: ref.storeId, userId: null, action: 'order.status_auto', entity: 'Order', entityId: ref.orderId, before: { status: done.before }, after: { status: done.after, courier: ref.courier, trackingNo: ref.trackingNo } })
    return target
  } catch (e) {
    if (!(e instanceof AdminError)) throw e // a rule said no (the owner changed it a moment ago): leave it for the owner
    return null
  }
}
