/**
 * The webhook router's brain, shared by every courier (each courier has a 3-line route file that calls this).
 *  1. who is calling?  The tenant comes from the URL path; the key must be THAT tenant's own key for THIS courier.
 *  2. what happened?   The adapter translates the courier's body into our vocabulary (or says "not a parcel update").
 *  3. whose parcel?    Looked up by tracking number AND that tenant's store: another tenant's data is not even readable here.
 * Courier status words are never stored; only the normalized status and our own text.
 */
import { db } from '@/lib/db'
import { getCourierAdapter } from '@/lib/couriers/factory'
import { STORED_STATUS } from '@/lib/couriers/contract'
import { readCourierConfig } from '@/lib/couriers/config'
import { advanceShipment, followOrder, saveEvents, type ShipmentRef } from '@/lib/couriers/news'
import type { OrderStatus } from '@/lib/admin/order-rules'
import type { ShipmentStatus } from '@/lib/couriers/status'
import { isConnected, webhookKey } from '@/lib/couriers/vault'
import { MAX_WEBHOOK_BYTES, extractKey, isPlausibleTenantId, keysMatch } from '@/lib/couriers/webhook-rules'
import { clientIp, rateLimit } from '@/lib/rate-limit'

const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function handleCourierWebhook(provider: string, tenantId: string, req: Request): Promise<Response> {
  const limit = rateLimit(`webhook:${clientIp(req.headers)}`, 120, 60_000)
  if (!limit.ok) return reply(429, { error: 'Too many requests.' })

  // 1. Who is calling? One answer ("no") for a wrong key, an unknown store and a store without this courier: nothing to probe.
  if (!isPlausibleTenantId(tenantId) || !keysMatch(extractKey(req.url, req.headers), webhookKey(tenantId, provider)) || !(await isConnected(tenantId, provider))) {
    return reply(401, { error: 'Not authorised.' })
  }
  if (Number(req.headers.get('content-length') ?? 0) > MAX_WEBHOOK_BYTES) return reply(413, { error: 'Too large.' })

  let payload: unknown
  try {
    const text = await req.text()
    if (text.length > MAX_WEBHOOK_BYTES) return reply(413, { error: 'Too large.' })
    payload = JSON.parse(text)
  } catch { return reply(400, { error: 'Unreadable.' }) }

  // 2. What happened?
  const update = getCourierAdapter(provider).parseWebhook(payload)
  if (!update) return reply(200, { ok: true, ignored: true }) // not a parcel update we understand: acknowledge so the courier does not retry forever

  // 3. Whose parcel? Only this tenant's.
  const row = await db.shipment.findFirst({
    where: { courier: provider, courierTrackingNo: update.trackingNumber, order: { storeId: tenantId } },
    select: { id: true, courier: true, status: true, order: { select: { id: true, status: true, storeId: true } } },
  })
  if (!row) return reply(200, { ok: true, matched: false })

  const ref: ShipmentRef = { id: row.id, courier: row.courier, trackingNo: update.trackingNumber, status: row.status as ShipmentStatus, orderId: row.order.id, orderStatus: row.order.status as OrderStatus, storeId: tenantId }
  const stored = STORED_STATUS[update.event.status]
  // Webhooks are re-sent: with no time from the courier, the same status twice in a row is saved once.
  const last = update.event.occurredAt ? null : await db.shipmentEvent.findFirst({ where: { shipmentId: row.id }, orderBy: { occurredAt: 'desc' }, select: { status: true } })
  if (last?.status !== stored) await saveEvents(row.id, [{ status: stored, text: update.event.description, location: update.event.location, at: update.event.occurredAt ?? new Date() }])
  const moved = await advanceShipment(ref, stored)
  let orderMoved: OrderStatus | null = null
  if (moved) {
    const settings = await db.storeSettings.findUnique({ where: { storeId: tenantId }, select: { extra: true } })
    orderMoved = await followOrder(ref, moved, readCourierConfig(settings?.extra))
  }
  return reply(200, { ok: true, matched: true, changed: !!moved, orderMoved: !!orderMoved })
}
