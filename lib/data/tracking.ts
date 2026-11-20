import { db } from '@/lib/db'
import { lastFour, maskedName } from '@/lib/phone'
import { RETURN_CUSTOMER_LABEL, alreadyReturned, isOpen, readReturnPolicy, returnWindow, type ReturnStatus } from '@/lib/returns'
import { isMeasured } from '@/lib/units/registry'
import { courierName, readCourierConfig, trackingLink } from '@/lib/couriers/config'
import { hasFeature } from '@/lib/plans/access'

export const STATUS_STEPS = ['PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const

export const STATUS_LABEL: Record<string, string> = {
  PLACED: 'Order placed',
  CONFIRMED: 'Confirmed',
  PACKED: 'Packed',
  SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
}


export interface TrackedOrder {
  number: string
  customerLabel: string
  city: string
  status: string
  placedAt: string
  items: { name: string; variantLabel: string | null; quantity: number; unitCode: string | null }[]
  /** Returns: what the customer may still send back, and how the latest return stands. */
  returns: { canRequest: boolean; daysLeft: number; policy: string; lines: { id: string; name: string; max: number; whole: boolean }[]; latest: { text: string; answer: string | null } | null }
  total: number
  amountDue: number
  paymentNote: string
  courier: { name: string; trackingNo: string | null; link: string | null } | null
  timeline: { status: string; label: string; note: string | null; at: string }[]
}

const fmt = (d: Date, tz: string) =>
  d.toLocaleString('en-GB', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })

/**
 * Public lookup for the "track my order" page.
 * Returns null for EVERY kind of miss (wrong code, wrong phone digits, other store) so
 * an attacker cannot tell which part was wrong. Only first name + last initial and the
 * city are exposed: never the phone number or street address.
 */
export async function lookupOrder(
  storeId: string,
  code: string,
  opts: { requirePhoneLast4: boolean; phoneLast4?: string; timezone?: string }
): Promise<TrackedOrder | null> {
  const tz = opts.timezone ?? 'Asia/Karachi'
  const [order, settings] = await Promise.all([db.order.findFirst({
    where: { storeId, trackingCode: code },
    include: {
      items: { select: { id: true, name: true, variantLabel: true, quantity: true, unitCode: true } },
      returns: { select: { status: true, items: true, answer: true }, orderBy: { createdAt: 'desc' } },
      history: { where: { isPublic: true }, orderBy: { createdAt: 'asc' } },
      shipments: { orderBy: { bookedAt: 'desc' }, take: 1 },
      payments: { select: { method: true, purpose: true, status: true, amount: true }, orderBy: { createdAt: 'asc' } },
    },
  }), db.storeSettings.findUnique({ where: { storeId }, select: { extra: true } })])
  if (!order) return null
  if (opts.requirePhoneLast4 && (opts.phoneLast4 ?? '') !== lastFour(order.customerPhone)) return null

  const advance = order.payments.find((p) => p.method !== 'COD')
  let paymentNote: string
  if (order.paymentStatus === 'PAID') paymentNote = 'Paid in full'
  else if (advance && advance.status === 'PENDING') paymentNote = 'Waiting for your payment to be confirmed'
  else if (order.paymentStatus === 'PARTIALLY_PAID') paymentNote = 'Advance payment received. The rest is due on delivery.'
  else if (order.paymentStatus === 'REFUNDED') paymentNote = 'Refunded'
  else paymentNote = 'Cash on delivery'

  // Returns: allowed only inside the shop's window after delivery, and never for what already came back.
  const policy = (await hasFeature(storeId, 'returns')) ? readReturnPolicy(settings?.extra) : readReturnPolicy(null), covered = alreadyReturned(order.returns)
  const deliveredAt = [...order.history].reverse().find((h) => h.status === 'DELIVERED')?.createdAt ?? null
  const window = returnWindow(policy, { status: order.status, deliveredAt }, order.returns.some((r) => isOpen(r.status)), new Date())
  const lines = order.items.map((i) => ({ id: i.id, name: i.variantLabel ? `${i.name} (${i.variantLabel})` : i.name, max: i.quantity - (covered.get(i.id) ?? 0), whole: isMeasured(i.unitCode) })).filter((l) => l.max > 0)
  const latest = order.returns[0]

  const shipment = order.shipments[0]
  const courierConfig = readCourierConfig(settings?.extra)
  return {
    number: order.number,
    customerLabel: maskedName(order.customerName),
    city: order.cityName,
    status: order.status,
    placedAt: fmt(order.placedAt, tz),
    items: order.items.map(({ name, variantLabel, quantity, unitCode }) => ({ name, variantLabel, quantity, unitCode })),
    returns: { canRequest: window.allowed && lines.length > 0, daysLeft: window.daysLeft, policy: policy.text, lines, latest: latest ? { text: RETURN_CUSTOMER_LABEL[latest.status as ReturnStatus] ?? '', answer: latest.status === 'REJECTED' ? latest.answer : null } : null },
    total: order.total.toNumber(),
    amountDue: order.amountDue.toNumber(),
    paymentNote,
    courier: shipment ? { name: courierName(courierConfig, shipment.courier), trackingNo: shipment.courierTrackingNo, link: trackingLink(courierConfig, shipment.courier, shipment.courierTrackingNo) } : null,
    timeline: order.history.map((h) => ({ status: h.status, label: STATUS_LABEL[h.status] ?? h.status, note: h.note, at: fmt(h.createdAt, tz) })),
  }
}
