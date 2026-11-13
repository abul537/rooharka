/**
 * Booking an order with a connected courier, through the contract only. Used by:
 *  - automatic booking when an order arrives (or its advance payment is confirmed),
 *  - the "Book" button on the order page, and
 *  - the retry job.
 * All three go through `bookOnce`, so none of them can create a second parcel.
 */
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { toShipmentOrder, type OrderRow } from '@/lib/couriers/shipment-order'
import { bookOnce, type BookingLedger, type BookOutcome, type Claim } from '@/lib/couriers/idempotent'
import { getCourierAdapter } from '@/lib/couriers/factory'
import { STATUS_TEXT } from '@/lib/couriers/contract'
import { recordCourierResult, withCredentials, isConnected } from '@/lib/couriers/vault'

const orderSelect = { id: true, storeId: true, number: true, status: true, source: true, total: true, amountPaid: true, customerName: true, customerEmail: true, customerPhone: true, cityName: true, landmark: true, localityName: true, payments: { select: { method: true, status: true } }, items: { select: { name: true, variantLabel: true, quantity: true, unitCode: true } } } as const

function ledgerFor(order: OrderRow, provider: string): BookingLedger {
  return {
    async claim(): Promise<Claim> {
      return db.$transaction(async (tx) => {
        // One booking decision at a time per order: the second caller waits here, then sees the first one's claim.
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order.id} AND "storeId" = ${order.storeId} FOR UPDATE`
        const rows = await tx.shipment.findMany({ where: { orderId: order.id }, select: { id: true, courier: true, courierTrackingNo: true } })
        const ours = rows.filter((r: { courier: string }) => r.courier === provider)
        const done = ours.find((r: { courierTrackingNo: string | null }) => r.courierTrackingNo)
        if (done) return { kind: 'existing', trackingNumber: done.courierTrackingNo! }
        if (ours.length) return { kind: 'pending' }
        if (rows.length) return { kind: 'skipped', reason: 'This order already has a shipment with another courier.' }
        const c = await tx.shipment.create({ data: { orderId: order.id, courier: provider, status: 'CREATED', codAmount: Math.max(0, order.total.toNumber() - order.amountPaid.toNumber()) }, select: { id: true } })
        return { kind: 'claimed', claimId: c.id }
      })
    },
    async complete(claimId, trackingNumber) {
      await db.$transaction([
        db.shipment.update({ where: { id: claimId }, data: { courierTrackingNo: trackingNumber, syncError: null } }),
        db.shipmentEvent.create({ data: { shipmentId: claimId, status: 'CREATED', description: STATUS_TEXT.label_created, location: null, occurredAt: new Date() } }),
      ])
    },
    async release(claimId) { await db.shipment.deleteMany({ where: { id: claimId, courierTrackingNo: null } }) },
    async flagUnknown(claimId, message) { await db.shipment.update({ where: { id: claimId }, data: { syncError: message.slice(0, 250) } }) },
  }
}

/** Books ONE order of a store. Never throws for a courier problem; the outcome says what happened. */
export async function bookOrderWithCourier(storeId: string, orderId: string, provider: string): Promise<BookOutcome> {
  const order = await db.order.findFirst({ where: { id: orderId, storeId }, select: orderSelect })
  if (!order) return { status: 'failed', kind: 'rejected', message: 'Order not found.' }
  if (['CANCELLED', 'RETURNED', 'DELIVERED'].includes(order.status)) return { status: 'skipped', reason: 'This order is closed.' }
  if (order.payments.some((p: { method: string; status: string }) => p.method !== 'COD' && p.status === 'PENDING')) return { status: 'skipped', reason: 'Waiting for the advance payment to be confirmed.' }

  const adapter = getCourierAdapter(provider)
  let outcome: BookOutcome
  try {
    outcome = await withCredentials(storeId, provider, (creds) => bookOnce(ledgerFor(order, provider), adapter, toShipmentOrder(order), creds))
  } catch (e) {
    outcome = { status: 'failed', kind: 'auth', message: e instanceof Error ? e.message : 'Could not book.' }
  }
  if (outcome.status === 'booked') {
    await recordCourierResult(storeId, provider, null).catch(() => {})
    await audit({ storeId, userId: null, action: 'shipment.booked', entity: 'Order', entityId: orderId, after: { courier: provider, trackingNo: outcome.trackingNumber, by: 'courier layer' } })
  } else if (outcome.status === 'failed') {
    await recordCourierResult(storeId, provider, outcome.message).catch(() => {})
  }
  return outcome
}

/** Automatic booking for a new order, for a store that has connected the courier. Safe to call twice. */
export async function autoBookOrder(storeId: string, orderId: string, provider = 'postex'): Promise<BookOutcome | null> {
  if (!(await isConnected(storeId, provider))) return null
  const o = await db.order.findFirst({ where: { id: orderId, storeId }, select: { source: true } })
  if (!o || o.source === 'POS') return null // a counter sale is handed over in the shop
  return bookOrderWithCourier(storeId, orderId, provider)
}

/** Resolves the new order by its number (what the checkout returns) and books it. Used right after checkout. */
export async function autoBookByNumber(storeId: string, number: string): Promise<void> {
  try {
    const o = await db.order.findFirst({ where: { storeId, number }, select: { id: true } })
    if (o) await autoBookOrder(storeId, o.id)
  } catch (e) { console.error('[auto booking] failed', storeId, number, e instanceof Error ? e.message : e) }
}

/**
 * Safety net, run by the scheduler: orders of the last 3 days that should have been booked but were not
 * (courier was down, token fixed later, advance payment confirmed after). Safe because every booking is idempotent.
 */
export async function retryUnbookedOrders(budget = 25): Promise<{ tried: number; booked: number }> {
  const stores = await db.tenantCourierCredential.findMany({ where: { isActive: true, provider: 'postex', store: { status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] } } }, select: { storeId: true }, take: 200 })
  let tried = 0, booked = 0
  for (const { storeId } of stores) {
    if (tried >= budget) break
    const orders = await db.order.findMany({
      where: { storeId, source: 'ONLINE', status: { in: ['PLACED', 'CONFIRMED', 'PACKED'] }, placedAt: { gte: new Date(Date.now() - 3 * 86_400_000) }, shipments: { none: {} } },
      orderBy: { placedAt: 'asc' }, take: budget - tried, select: { id: true },
    })
    for (const o of orders) {
      tried++
      const r = await autoBookOrder(storeId, o.id).catch(() => null)
      if (r?.status === 'booked') booked++
    }
  }
  return { tried, booked }
}
