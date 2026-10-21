import { db } from '@/lib/db'
import { lastFour, maskedName } from '@/lib/phone'
import { courierName, readCourierConfig, trackingLink } from '@/lib/couriers/config'

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
  items: { name: string; variantLabel: string | null; quantity: number }[]
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
      items: { select: { name: true, variantLabel: true, quantity: true } },
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

  const shipment = order.shipments[0]
  const courierConfig = readCourierConfig(settings?.extra)
  return {
    number: order.number,
    customerLabel: maskedName(order.customerName),
    city: order.cityName,
    status: order.status,
    placedAt: fmt(order.placedAt, tz),
    items: order.items,
    total: order.total.toNumber(),
    amountDue: order.amountDue.toNumber(),
    paymentNote,
    courier: shipment ? { name: courierName(courierConfig, shipment.courier), trackingNo: shipment.courierTrackingNo, link: trackingLink(courierConfig, shipment.courier, shipment.courierTrackingNo) } : null,
    timeline: order.history.map((h) => ({ status: h.status, label: STATUS_LABEL[h.status] ?? h.status, note: h.note, at: fmt(h.createdAt, tz) })),
  }
}
