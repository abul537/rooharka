/**
 * RUNNING THE FAKE-ORDER CHECK on one order and saving the decision.
 *
 * It runs right after checkout has answered the customer (so it never slows or breaks an order), and again when
 * the owner presses "Check again". Only cash-on-delivery orders placed online are checked: a prepaid order has
 * already proven itself, and a counter sale is handed over in the shop.
 */
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { getServiceSecrets } from '@/lib/services/store-services'
import { mailConfigured, sendMail } from '@/lib/mail'
import { rateLimit } from '@/lib/rate-limit'
import { decide, readFraudSettings, VERDICT_TEXT, type Decision, type IpRisk } from '@/lib/fraud/rules'
import { firstOrderAverage, loadHistory, partnerLabel } from '@/lib/fraud/network'
import { ipRisk } from '@/lib/fraud/ip-risk'
import { hasFeature } from '@/lib/plans/access'

const SELECT = {
  id: true, storeId: true, number: true, source: true, status: true, total: true, customerPhone: true, customerName: true, cityName: true, localityName: true, landmark: true,
  verificationStatus: true, verification: true,
  payments: { select: { method: true }, orderBy: { createdAt: 'asc' }, take: 1 },
} as const

/** What is stored on the order for the owner to read (no secrets, and never the buyer's IP address itself). */
export interface StoredCheck { reasons: Decision['reasons']; network: Awaited<ReturnType<typeof loadHistory>>['network']; codLast24h: number; ip: IpRisk | null; ipAsked: boolean; checkedAt: string }
const storedIp = (v: unknown): IpRisk | null => {
  const ip = v && typeof v === 'object' ? (v as { ip?: Partial<IpRisk> }).ip : null
  return ip && typeof ip.score === 'number' ? { score: ip.score, proxy: ip.proxy === true, country: typeof ip.country === 'string' ? ip.country : null } : null
}

/**
 * Checks one order of one store. Returns the decision, or null when the order is not one to check (prepaid,
 * counter sale, check switched off, already decided and `again` not asked).
 * `ip` is the buyer's address at checkout; on a later re-check the earlier IP result is reused.
 */
export async function verifyOrder(storeId: string, orderId: string, opts: { ip?: string | null; again?: boolean; userId?: string | null } = {}): Promise<Decision | null> {
  const [order, settings] = await Promise.all([
    db.order.findFirst({ where: { id: orderId, storeId }, select: SELECT }),
    db.storeSettings.findUnique({ where: { storeId }, select: { extra: true, displayName: true } }),
  ])
  if (!order || order.source !== 'ONLINE' || order.payments[0]?.method !== 'COD') return null
  if (order.verificationStatus && !opts.again) return null
  const rules = readFraudSettings(settings?.extra)
  if (!rules.enabled) return null
  // A Pro feature: on Basic, orders are not checked (and so never held).
  if (!(await hasFeature(storeId, 'fraud-check'))) return null

  const total = order.total.toNumber()
  const [history, partner, average, ip] = await Promise.all([
    loadHistory(order),
    partnerLabel({ phone: order.customerPhone, city: order.cityName, address: order.landmark }),
    firstOrderAverage(storeId),
    // Only larger orders are sent to the paid IP service, and only when the store connected its own account.
    (async (): Promise<{ asked: boolean; result: IpRisk | null }> => {
      if (!opts.ip) return { asked: false, result: storedIp(order.verification) }
      if (total <= rules.ipCheckOver) return { asked: false, result: null }
      const s = await getServiceSecrets(storeId, 'ipqs').catch(() => null)
      if (!s?.enabled || !s.credentials.apiKey) return { asked: false, result: null }
      return { asked: true, result: await ipRisk(s.credentials.apiKey, opts.ip) }
    })(),
  ])

  const decision = decide({ phone: order.customerPhone, network: history.network, partnerLabel: partner, codLast24h: history.codLast24h, own: history.own, total, firstOrderAverage: average, ip: ip.result }, rules)
  const stored: StoredCheck = { reasons: decision.reasons, network: history.network, codLast24h: history.codLast24h, ip: ip.result, ipAsked: ip.asked, checkedAt: new Date().toISOString() }
  const first = !order.verificationStatus
  await db.$transaction([
    db.order.updateMany({
      where: { id: order.id, storeId },
      data: { fraudRiskLabel: decision.label, verificationStatus: decision.status, riskScore: decision.riskScore, recommendedAction: decision.recommendedAction, verification: stored as object, verifiedAt: new Date(), verificationOverrideBy: null, verificationOverrideAt: null },
    }),
    // A private line in the order's history (the customer never sees it).
    ...(first || decision.status !== order.verificationStatus
      ? [db.orderStatusHistory.create({ data: { orderId: order.id, status: order.status, isPublic: false, createdById: opts.userId ?? null, note: `Fake-order check: ${VERDICT_TEXT[decision.status].label}. ${decision.reasons.filter((r) => r.level !== 'good').map((r) => r.text).join(' ')}`.trim().slice(0, 300) } })]
      : []),
  ])
  await audit({ storeId, userId: opts.userId ?? null, action: 'order.verification', entity: 'Order', entityId: order.id, after: { status: decision.status, label: decision.label, reasons: decision.reasons.map((r) => r.code) } })
  if (first && decision.status === 'BLOCK') await notifyBlocked(storeId, order.number, settings?.displayName ?? 'your shop', decision)
  return decision
}

/** Tells the owner by email that an order was blocked (the dashboard shows it either way). At most 5 an hour per store. */
async function notifyBlocked(storeId: string, number: string, shop: string, d: Decision) {
  try {
    if (!mailConfigured() || !rateLimit(`fraud-mail:${storeId}`, 5, 3_600_000).ok) return
    const store = await db.store.findUnique({ where: { id: storeId }, select: { ownerEmail: true } })
    if (!store?.ownerEmail) return
    const lines = d.reasons.filter((r) => r.level !== 'good').map((r) => r.text)
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
    await sendMail({
      to: store.ownerEmail, subject: `Order #${number} was blocked by the fake-order check`,
      text: `Order #${number} at ${shop} looks like a fake order, so no courier was booked.\n\n${lines.map((l) => `- ${l}`).join('\n')}\n\nOpen the order in your dashboard to approve it (if you know the buyer) or cancel it.`,
      html: `<p>Order <strong>#${esc(number)}</strong> at ${esc(shop)} looks like a fake order, so no courier was booked.</p><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><p>Open the order in your dashboard to approve it (if you know the buyer) or cancel it.</p>`,
    })
  } catch (e) { console.error('[fraud] blocked-order email', e instanceof Error ? e.message : e) }
}

/** Right after checkout: find the new order by its number and check it. Never throws. */
export async function verifyByNumber(storeId: string, number: string, ip: string): Promise<void> {
  try {
    const o = await db.order.findFirst({ where: { storeId, number }, select: { id: true } })
    if (o) await verifyOrder(storeId, o.id, { ip })
  } catch (e) { console.error('[fraud] check failed; the order is left unchecked', e instanceof Error ? e.message : e) }
}

/**
 * The owner looked at a held order and says it is genuine: the hold is lifted (and recorded with their name).
 * Returns false when the order was not held (someone else already decided).
 */
export async function approveHeldOrder(admin: { id: string; storeId: string }, orderId: string): Promise<{ number: string } | null> {
  const order = await db.order.findFirst({ where: { id: orderId, storeId: admin.storeId }, select: { id: true, number: true, status: true, verificationStatus: true } })
  if (!order || (order.verificationStatus !== 'REVIEW' && order.verificationStatus !== 'BLOCK')) return null
  const res = await db.order.updateMany({ where: { id: order.id, storeId: admin.storeId, verificationStatus: order.verificationStatus }, data: { verificationStatus: 'CLEAR', verificationOverrideBy: admin.id, verificationOverrideAt: new Date() } })
  if (res.count === 0) return null
  await db.orderStatusHistory.create({ data: { orderId: order.id, status: order.status, isPublic: false, createdById: admin.id, note: `Fake-order check: approved by the shop after checking (it was ${order.verificationStatus === 'BLOCK' ? 'blocked' : 'held for review'}).` } })
  return { number: order.number }
}
