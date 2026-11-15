/**
 * THE TRUST NETWORK: what every store on the platform, together, knows about a buyer.
 *
 * These are the only queries in the product that deliberately look ACROSS stores, and they return COUNTS only:
 * a store owner learns "2 parcels to this number came back", never from which shop, what was bought or for how much.
 * Counter (POS) sales are left out: they say nothing about refusing a parcel.
 *
 * A partner network (SafeShip, Munshi Trust Network or similar) can be added by implementing `PartnerNetwork`
 * and listing it in PARTNERS; neither offers an API for outside platforms today, so the list is empty.
 */
import { db } from '@/lib/db'
import { memoKeyed } from '@/lib/memo'
import { summariseHistory, type NetworkHistory, type RiskLabel } from '@/lib/fraud/rules'

export interface PartnerNetwork { key: string; lookup(q: { phone: string; city: string; address: string | null }): Promise<RiskLabel | null> }
export const PARTNERS: PartnerNetwork[] = []

/** The most careful label any connected partner gives, or null (also when a partner fails: no answer is no change). */
export async function partnerLabel(q: { phone: string; city: string; address: string | null }): Promise<RiskLabel | null> {
  let worst: RiskLabel | null = null
  for (const p of PARTNERS) {
    const l = await p.lookup(q).catch((e) => { console.warn(`[trust network] ${p.key} did not answer`, e instanceof Error ? e.name : ''); return null })
    if (l === 'RISKY' || (l === 'NEUTRAL' && worst !== 'RISKY') || (l === 'TRUSTED' && !worst)) worst = l
  }
  return worst
}

const DAYS_180 = 180 * 86_400_000

export async function loadHistory(o: { id: string; storeId: string; customerPhone: string; cityName: string; localityName: string; landmark: string | null }, now = new Date()) {
  const landmark = (o.landmark ?? '').trim()
  const [rows, blockedByStores, addressReturned] = await Promise.all([
    // PLATFORM-WIDE on purpose (no store filter): the buyer's recent online orders at every store.
    db.order.findMany({ where: { customerPhone: o.customerPhone, source: 'ONLINE' }, orderBy: { placedAt: 'desc' }, take: 300, select: { id: true, storeId: true, status: true, placedAt: true, payments: { select: { method: true }, orderBy: { createdAt: 'asc' }, take: 1 } } }),
    db.blocklistEntry.count({ where: { type: 'PHONE', value: o.customerPhone, storeId: { not: o.storeId } } }),
    // The same street address under ANOTHER number, returned in the last six months. Needs a real landmark to compare.
    landmark.length >= 8
      ? db.order.count({ where: { status: 'RETURNED', source: 'ONLINE', cityName: o.cityName, localityName: o.localityName, landmark: { equals: landmark, mode: 'insensitive' }, customerPhone: { not: o.customerPhone }, placedAt: { gte: new Date(now.getTime() - DAYS_180) } } })
      : 0,
  ])
  const summary = summariseHistory(rows.map((r) => ({ id: r.id, storeId: r.storeId, status: r.status, placedAt: r.placedAt, cod: r.payments[0]?.method === 'COD' })), o.storeId, o.id, now)
  const network: NetworkHistory = { delivered: summary.delivered, returned: summary.returned, blockedByStores, addressReturned }
  return { network, codLast24h: summary.codLast24h, own: summary.own }
}

/**
 * The store's average FIRST order (each customer's first online order), or null while there are fewer than 10
 * to judge by. Remembered for ten minutes per store; a failure simply means "unknown".
 */
export const firstOrderAverage = memoKeyed(10 * 60_000, async (storeId: string): Promise<number | null> => {
  try {
    const rows = await db.$queryRaw<{ avg: number | null; n: bigint | number }[]>`
      SELECT AVG(t."total")::float8 AS avg, COUNT(*) AS n FROM (
        SELECT DISTINCT ON ("customerId") "total" FROM "Order"
        WHERE "storeId" = ${storeId} AND "source" = 'ONLINE' AND "status" <> 'CANCELLED'
        ORDER BY "customerId", "placedAt" ASC
      ) t`
    const r = rows[0]
    return r && Number(r.n) >= 10 && typeof r.avg === 'number' && r.avg > 0 ? r.avg : null
  } catch (e) { console.error('[fraud] first-order average', e); return null }
})
