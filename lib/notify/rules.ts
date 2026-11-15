/**
 * MESSAGES TO CUSTOMERS AND THE OWNER: the rules and the words (pure).
 *
 * A customer can be told by SMS or WhatsApp when their order is received, confirmed, shipped, out for delivery,
 * delivered or cancelled. The messages go through the STORE'S OWN messaging account (the same one used for
 * verification codes), so the store owner chooses which ones are worth their cost. The owner can also get an
 * email for every new order.
 */
export const NOTIFY_EVENTS = ['PLACED', 'CONFIRMED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'] as const
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number]
export const EVENT_LABEL: Record<NotifyEvent, string> = { PLACED: 'Order received', CONFIRMED: 'Order confirmed', SHIPPED: 'Order shipped', OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered', CANCELLED: 'Order cancelled' }

export interface NotifySettings { channel: 'SMS' | 'WHATSAPP'; events: NotifyEvent[]; ownerEmail: boolean; dailyLimit: number }
export const DEFAULT_NOTIFY: NotifySettings = { channel: 'SMS', events: [], ownerEmail: true, dailyLimit: 300 }
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

export function readNotify(extra: unknown): NotifySettings {
  const n = obj(obj(extra).notify)
  const limit = typeof n.dailyLimit === 'number' && Number.isInteger(n.dailyLimit) && n.dailyLimit >= 1 && n.dailyLimit <= 20_000 ? n.dailyLimit : DEFAULT_NOTIFY.dailyLimit
  return {
    channel: n.channel === 'WHATSAPP' ? 'WHATSAPP' : 'SMS',
    events: Array.isArray(n.events) ? NOTIFY_EVENTS.filter((e) => (n.events as unknown[]).includes(e)) : [],
    ownerEmail: typeof n.ownerEmail === 'boolean' ? n.ownerEmail : DEFAULT_NOTIFY.ownerEmail,
    dailyLimit: limit,
  }
}
export function parseNotifyForm(get: (k: string) => unknown): { ok: true; value: NotifySettings } | { ok: false; error: string } {
  const limit = String(get('dailyLimit') ?? '').trim()
  if (!/^\d{1,5}$/.test(limit) || Number(limit) < 1 || Number(limit) > 20_000) return { ok: false, error: 'Messages per day must be a whole number from 1 to 20,000.' }
  return { ok: true, value: { channel: get('channel') === 'WHATSAPP' ? 'WHATSAPP' : 'SMS', events: NOTIFY_EVENTS.filter((e) => get(`event-${e}`) === 'on'), ownerEmail: get('ownerEmail') === 'on', dailyLimit: Number(limit) } }
}

const rs = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`
const first = (name: string) => name.trim().split(/\s+/)[0]?.slice(0, 20) || 'Customer'
/** No line breaks or odd characters reach an SMS, and a shop or customer name cannot smuggle a web address in. */
const plain = (s: string, max: number) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/\s+/g, ' ').trim().slice(0, max)

export interface OrderFacts { store: string; name: string; number: string; total: number; due: number; trackingCode: string; trackUrl: string | null; courier?: string | null; courierTrackingNo?: string | null }
/** The message for one step, kept short (an SMS is charged per 160 characters). */
export function customerMessage(event: NotifyEvent, o: OrderFacts): string {
  const shop = plain(o.store, 30), hi = `${first(plain(o.name, 40))},`, n = `#${o.number}`
  const track = o.trackUrl ? ` Track: ${o.trackUrl}` : ` Tracking code: ${o.trackingCode}`
  const cod = o.due > 0 ? ` Please keep ${rs(o.due)} ready.` : ''
  switch (event) {
    case 'PLACED': return `${hi} ${shop} received your order ${n} (${rs(o.total)}).${track}`
    case 'CONFIRMED': return `${hi} your order ${n} from ${shop} is confirmed and being prepared.`
    case 'SHIPPED': return `${hi} your order ${n} from ${shop} has been shipped${o.courier ? ` with ${plain(o.courier, 20)}${o.courierTrackingNo ? ` (no. ${plain(o.courierTrackingNo, 24)})` : ''}` : ''}.${track}`
    case 'OUT_FOR_DELIVERY': return `${hi} your order ${n} from ${shop} is out for delivery today.${cod}`
    case 'DELIVERED': return `${hi} your order ${n} from ${shop} was delivered. Thank you for shopping with us!`
    case 'CANCELLED': return `${hi} your order ${n} from ${shop} was cancelled. Contact us if this is a mistake.`
  }
}
export const isNotifyEvent = (s: string): s is NotifyEvent => (NOTIFY_EVENTS as readonly string[]).includes(s)

export interface NewOrderFacts { store: string; number: string; customer: string; city: string; total: number; payment: string; lines: { name: string; quantity: string }[]; dashboardUrl: string | null }
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
/** The "you have a new order" email for the store owner. */
export function newOrderMail(to: string, o: NewOrderFacts): { to: string; subject: string; text: string; html: string } {
  const lines = o.lines.slice(0, 20)
  return {
    to, subject: `New order #${o.number}: ${rs(o.total)} (${plain(o.customer, 40)}, ${plain(o.city, 30)})`,
    text: `New order #${o.number} at ${o.store}\n\nCustomer: ${o.customer}, ${o.city}\nTotal: ${rs(o.total)} (${o.payment})\n\n${lines.map((l) => `- ${l.name} x ${l.quantity}`).join('\n')}\n\n${o.dashboardUrl ? `Open it: ${o.dashboardUrl}` : 'Open your dashboard to confirm it.'}`,
    html: `<p><strong>New order #${esc(o.number)}</strong> at ${esc(o.store)}</p><p>Customer: ${esc(o.customer)}, ${esc(o.city)}<br>Total: <strong>${esc(rs(o.total))}</strong> (${esc(o.payment)})</p><ul>${lines.map((l) => `<li>${esc(l.name)} &times; ${esc(l.quantity)}</li>`).join('')}</ul>${o.dashboardUrl ? `<p><a href="${esc(o.dashboardUrl)}">Open the order in your dashboard</a></p>` : '<p>Open your dashboard to confirm it.</p>'}`,
  }
}
