/**
 * SENDING the messages. Everything here is best effort: a message that cannot be sent is logged and forgotten,
 * and it can never fail, slow or undo the order change that caused it.
 */
import { db } from '@/lib/db'
import { loadServiceViews, getServiceSecrets } from '@/lib/services/store-services'
import { resolveProvider } from '@/lib/otp/rules'
import { sendMessage } from '@/lib/otp/senders'
import { mailConfigured, sendMail } from '@/lib/mail'
import { rateLimit } from '@/lib/rate-limit'
import { formatQuantity } from '@/lib/units/registry'
import { customerMessage, isNotifyEvent, newOrderMail, readNotify } from '@/lib/notify/rules'
import { hasFeature } from '@/lib/plans/access'

/**
 * Tells the customer about the step their order is at NOW, if the owner switched that message on and it has not
 * been sent for this order before. Safe to call after any change: it works out by itself whether to send.
 */
export async function notifyOrder(storeId: string, orderId: string): Promise<void> {
  try {
    const order = await db.order.findFirst({
      where: { id: orderId, storeId, source: 'ONLINE' },
      select: { id: true, number: true, status: true, total: true, amountDue: true, customerName: true, customerPhone: true, trackingCode: true, notifiedStatuses: true, shipments: { orderBy: { bookedAt: 'desc' }, take: 1, select: { courier: true, courierTrackingNo: true } } },
    })
    if (!order || !isNotifyEvent(order.status) || order.notifiedStatuses.includes(order.status)) return
    if (!(await hasFeature(storeId, 'sms-updates'))) return // Pro feature (the owner's new-order email stays on every plan)
    const settings = await db.storeSettings.findUnique({ where: { storeId }, select: { extra: true, displayName: true, orderTrackingEnabled: true } })
    const rules = readNotify(settings?.extra)
    if (!rules.events.includes(order.status)) return
    const provider = resolveProvider((await loadServiceViews(storeId)).values(), rules.channel)
    if ('problem' in provider) return
    if (!rateLimit(`notify:${storeId}`, rules.dailyLimit, 86_400_000).ok) { console.warn('[notify] daily limit reached for a store'); return }
    // Claim this step for this order BEFORE sending: two changes arriving together send one message, not two.
    const claimed = await db.order.updateMany({ where: { id: order.id, storeId, NOT: { notifiedStatuses: { has: order.status } } }, data: { notifiedStatuses: { push: order.status } } })
    if (claimed.count === 0) return
    const secrets = await getServiceSecrets(storeId, provider.key)
    if (!secrets) return
    const host = await db.storeDomain.findFirst({ where: { storeId, verifiedAt: { not: null } }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], select: { host: true } }).catch(() => null)
    const text = customerMessage(order.status, {
      store: settings?.displayName ?? 'our shop', name: order.customerName, number: order.number, total: order.total.toNumber(), due: order.amountDue.toNumber(), trackingCode: order.trackingCode,
      trackUrl: host && settings?.orderTrackingEnabled ? `https://${host.host}/track?code=${order.trackingCode}` : null,
      courier: order.shipments[0]?.courier, courierTrackingNo: order.shipments[0]?.courierTrackingNo,
    })
    const sent = await sendMessage(provider.key, secrets.credentials, secrets.config, rules.channel, order.customerPhone, text)
    await db.orderStatusHistory.create({ data: { orderId: order.id, status: order.status, isPublic: false, note: sent.ok ? `${rules.channel === 'WHATSAPP' ? 'WhatsApp' : 'SMS'} sent to the customer: ${text}`.slice(0, 300) : `Message to the customer could not be sent (${sent.error})`.slice(0, 300) } })
  } catch (e) { console.error('[notify] customer message failed', e instanceof Error ? e.message : e) }
}

/** Emails the store owner about a new order (platform email; at most 60 an hour per store). */
export async function notifyOwnerNewOrder(storeId: string, orderId: string, origin: string | null): Promise<void> {
  try {
    if (!mailConfigured()) return
    const [order, store] = await Promise.all([
      db.order.findFirst({ where: { id: orderId, storeId, source: 'ONLINE' }, select: { id: true, number: true, total: true, customerName: true, cityName: true, payments: { select: { method: true }, orderBy: { createdAt: 'asc' }, take: 1 }, items: { select: { name: true, variantLabel: true, quantity: true, unitCode: true } } } }),
      db.store.findUnique({ where: { id: storeId }, select: { ownerEmail: true, settings: { select: { extra: true, displayName: true } } } }),
    ])
    if (!order || !store?.ownerEmail || !readNotify(store.settings?.extra).ownerEmail) return
    if (!rateLimit(`notify-owner:${storeId}`, 60, 3_600_000).ok) return
    const method = order.payments[0]?.method ?? 'COD'
    await sendMail(newOrderMail(store.ownerEmail, {
      store: store.settings?.displayName ?? 'your shop', number: order.number, customer: order.customerName, city: order.cityName, total: order.total.toNumber(),
      payment: method === 'COD' ? 'cash on delivery' : `${method === 'JAZZCASH' ? 'JazzCash' : 'EasyPaisa'}, check the payment`,
      lines: order.items.map((i) => ({ name: i.variantLabel ? `${i.name} (${i.variantLabel})` : i.name, quantity: i.unitCode ? formatQuantity(i.quantity, i.unitCode) : String(i.quantity) })),
      dashboardUrl: origin ? `${origin}/admin/orders/${order.id}` : null,
    }))
  } catch (e) { console.error('[notify] owner email failed', e instanceof Error ? e.message : e) }
}

/** Runs `notifyOrder` after the current request has answered (so the owner's click is never slowed). */
export function queueOrderMessage(storeId: string, orderId: string): void {
  const run = () => notifyOrder(storeId, orderId)
  import('next/server').then(({ after }) => { try { after(run) } catch { void run() } }).catch(() => { void run() })
}
