import { db } from '@/lib/db'
import { AdminError } from '@/lib/admin/orders'
import type { OrderStatus } from '@/lib/admin/order-rules'
import { ADAPTERS } from '@/lib/couriers/adapters'
import { courierName, readCourierConfig, type CourierConfig } from '@/lib/couriers/config'
import { currentStatus, isFinished, type ShipmentStatus, type TrackEvent } from '@/lib/couriers/status'
import { serviceDef } from '@/lib/services/registry'
import { getServiceSecrets, recordServiceResult, type ServiceSecrets } from '@/lib/services/store-services'
import { STORED_STATUS, isCourierError } from '@/lib/couriers/contract'
import { CONTRACT_COURIERS, getCourierAdapter, isContractCourier } from '@/lib/couriers/factory'
import { isConnected, recordCourierResult, withCredentials } from '@/lib/couriers/vault'
import { advanceShipment, followOrder, saveEvents, type ShipmentRef } from '@/lib/couriers/news'

/**
 * Asks each courier (with the STORE'S OWN account) where its parcels are, saves the news on the shipment, and,
 * only if the owner switched "update orders automatically" on, moves the order along.
 *
 * Safety: read-only towards the courier; parcel status only moves forward; an order only follows along steps the
 * order rules allow; one failing parcel or store never stops the others.
 */
const WINDOW_DAYS = 45
const CONCURRENCY = 4
const MAX_PER_RUN = 200

export interface SyncOutcome {
  orderNumber: string
  /** What the courier said, in its own words. */
  courierSays: string | null
  status: ShipmentStatus | null
  shipmentChanged: boolean
  orderMovedTo: OrderStatus | null
  error: string | null
}

export interface SyncSummary { checked: number; shipmentsUpdated: number; ordersMoved: number; errors: number; skipped: number; timeLeft: boolean }

type Row = Awaited<ReturnType<typeof loadRows>>[number]
const loadRows = (where: object, take: number) => db.shipment.findMany({
  where: { courierTrackingNo: { not: null }, courier: { in: [...CONTRACT_COURIERS, ...Object.keys(ADAPTERS)] }, order: { status: { in: ['SHIPPED', 'OUT_FOR_DELIVERY'] } }, bookedAt: { gte: new Date(Date.now() - WINDOW_DAYS * 86_400_000) }, ...where },
  orderBy: [{ syncedAt: { sort: 'asc', nulls: 'first' } }, { bookedAt: 'asc' }],
  take,
  select: { id: true, courier: true, courierTrackingNo: true, status: true, order: { select: { id: true, number: true, status: true, storeId: true } } },
})

const complete = (courier: string, s: ServiceSecrets | null) => {
  const def = serviceDef(courier)
  return !!s?.enabled && !!def && def.credentials.filter((f) => f.required).every((f) => s.credentials[f.name]) && def.config.filter((f) => f.required).every((f) => s.config[f.name])
}

/** Asks the courier about one parcel. `current` is the parcel's status when the courier already speaks our vocabulary. */
type Tracker = (tn: string) => Promise<{ ok: true; statusText: string; events: TrackEvent[]; current?: ShipmentStatus | null } | { ok: false; error: string }>

/** How to ask THIS store's courier, or null when it is not connected (nothing to ask). Contract couriers use the vault; older ones the service settings. */
async function trackerFor(storeId: string, courier: string, legacy: ServiceSecrets | null): Promise<Tracker | null> {
  if (isContractCourier(courier)) {
    if (!(await isConnected(storeId, courier))) return null
    const adapter = getCourierAdapter(courier)
    return async (tn) => {
      try {
        const events = await withCredentials(storeId, courier, (c) => adapter.track(tn, c))
        const mapped: TrackEvent[] = events.map((e) => ({ status: STORED_STATUS[e.status], text: e.description, location: e.location, at: e.occurredAt }))
        const last = events[events.length - 1]
        return { ok: true, statusText: last?.description ?? '', events: mapped, current: last ? STORED_STATUS[last.status] : null }
      } catch (e) { return { ok: false, error: isCourierError(e) ? e.message : 'Could not ask the courier.' } }
    }
  }
  if (!legacy || !complete(courier, legacy) || !ADAPTERS[courier]) return null
  return (tn) => ADAPTERS[courier].track(tn, legacy.credentials, legacy.config)
}

const recordResult = (storeId: string, courier: string, error: string | null) =>
  (isContractCourier(courier) ? recordCourierResult(storeId, courier, error) : recordServiceResult(storeId, courier, error)).catch(() => {})

/** One parcel: ask, save the news, maybe move the order. Never throws for a courier problem. */
async function syncOne(row: Row, track: Tracker, config: CourierConfig): Promise<SyncOutcome> {
  const base = { orderNumber: row.order.number, courierSays: null as string | null, status: null as ShipmentStatus | null, shipmentChanged: false, orderMovedTo: null as OrderStatus | null, error: null as string | null }
  const now = new Date()
  const tn = row.courierTrackingNo!
  const ref: ShipmentRef = { id: row.id, courier: row.courier, trackingNo: tn, status: row.status as ShipmentStatus, orderId: row.order.id, orderStatus: row.order.status as OrderStatus, storeId: row.order.storeId }
  let status = ref.status
  let courierSays: string | null = null

  if (!isFinished(status)) {
    const r = await track(tn)
    if (!r.ok) {
      await db.shipment.update({ where: { id: row.id }, data: { syncedAt: now, syncError: r.error.slice(0, 200) } })
      await recordResult(row.order.storeId, row.courier, r.error.slice(0, 200))
      return { ...base, error: r.error }
    }
    courierSays = r.statusText || r.events[0]?.text || null
    const seen = r.current ?? currentStatus(r.statusText, r.events)
    await saveEvents(row.id, r.events)
    const moved = await advanceShipment(ref, seen, now)
    await db.shipment.update({ where: { id: row.id }, data: { syncedAt: now, syncError: null } })
    await recordResult(row.order.storeId, row.courier, null)
    if (moved) { status = moved; base.shipmentChanged = true }
  }
  base.courierSays = courierSays
  base.status = status
  base.orderMovedTo = await followOrder({ ...ref, status }, status, config)
  return base
}

async function mapLimit<T>(items: T[], limit: number, deadline: number, fn: (item: T) => Promise<void>): Promise<boolean> {
  let i = 0, ran = true
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      if (Date.now() > deadline) { ran = false; return }
      await fn(items[i++])
    }
  }))
  return ran
}

/** Every store's in-flight parcels, oldest-checked first, within a time budget. Called by the scheduler. */
export async function syncAllCouriers(budgetMs = 45_000): Promise<SyncSummary> {
  const sum: SyncSummary = { checked: 0, shipmentsUpdated: 0, ordersMoved: 0, errors: 0, skipped: 0, timeLeft: true }
  const rows = (await loadRows({ order: { status: { in: ['SHIPPED', 'OUT_FOR_DELIVERY'] }, store: { status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] } } } }, MAX_PER_RUN))
  if (!rows.length) return sum

  const storeIds = [...new Set(rows.map((r) => r.order.storeId))]
  const settings = await db.storeSettings.findMany({ where: { storeId: { in: storeIds } }, select: { storeId: true, extra: true } })
  const configs = new Map(settings.map((s) => [s.storeId, readCourierConfig(s.extra)]))
  const secretCache = new Map<string, Promise<ServiceSecrets | null>>()
  const secretsFor = (storeId: string, courier: string) => {
    const k = `${storeId}|${courier}`
    if (!secretCache.has(k)) secretCache.set(k, getServiceSecrets(storeId, courier).catch(() => null))
    return secretCache.get(k)!
  }

  sum.timeLeft = await mapLimit(rows, CONCURRENCY, Date.now() + budgetMs, async (row) => {
    try {
      const config = configs.get(row.order.storeId) ?? readCourierConfig(null)
      const secrets = isContractCourier(row.courier) ? null : await secretsFor(row.order.storeId, row.courier)
      const track = await trackerFor(row.order.storeId, row.courier, secrets)
      // Not connected (or switched off): nothing to ask. Finished parcels only matter if orders follow automatically.
      if (!track || (isFinished(row.status as ShipmentStatus) && !config.autoUpdate)) { sum.skipped++; return }
      const o = await syncOne(row, track, config)
      sum.checked++
      if (o.error) sum.errors++
      if (o.shipmentChanged) sum.shipmentsUpdated++
      if (o.orderMovedTo) sum.ordersMoved++
    } catch (e) {
      sum.errors++
      console.error('[courier sync] parcel failed', row.id, e)
    }
  })
  return sum
}

/** "Refresh from courier" on one order's page. Returns what the courier said for each parcel, so the owner can check it. */
export async function syncOrder(admin: { storeId: string }, orderId: string): Promise<{ lines: string[]; config: CourierConfig }> {
  const [rows, settings] = await Promise.all([
    loadRows({ orderId, order: { storeId: admin.storeId } }, 10),
    db.storeSettings.findUnique({ where: { storeId: admin.storeId }, select: { extra: true } }),
  ])
  const config = readCourierConfig(settings?.extra)
  if (!rows.length) throw new AdminError('Nothing to refresh: this order has no parcel that can be tracked automatically. Only PostEx and Leopards parcels that are on their way can be refreshed.')
  const lines: string[] = []
  for (const row of rows) {
    const name = courierName(config, row.courier)
    const secrets = isContractCourier(row.courier) ? null : await getServiceSecrets(admin.storeId, row.courier).catch(() => null)
    const track = await trackerFor(admin.storeId, row.courier, secrets)
    if (!track) { lines.push(`${name}: connect and switch on your ${name} account in Settings > Couriers to refresh.`); continue }
    const o = await syncOne(row, track, config)
    lines.push(o.error ? `${name}: ${o.error}` : `${name} says: “${o.courierSays ?? 'no news yet'}”.${o.orderMovedTo ? ` The order is now ${o.orderMovedTo.toLowerCase().replace(/_/g, ' ')}.` : config.autoUpdate ? '' : ' Orders are not set to update automatically; change the order status yourself if this is right.'}`)
  }
  return { lines, config }
}
