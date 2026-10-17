/**
 * Pure business rules for order status changes: no database here, so they are easy to test.
 */
export type OrderStatus =
  | 'PLACED' | 'CONFIRMED' | 'PACKED' | 'SHIPPED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED' | 'RETURNED'

/** Where an order may go next. Anything not listed is refused. */
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
}

export interface TransitionCheck {
  ok: boolean
  reason?: string
}

/**
 * `hasPendingAdvance` = the customer was asked to prepay and the store has not
 * confirmed that money yet. Such an order must not be packed or shipped.
 */
export function checkTransition(from: OrderStatus, to: OrderStatus, hasPendingAdvance: boolean): TransitionCheck {
  if (!NEXT_STATUSES[from]?.includes(to)) {
    return { ok: false, reason: `An order that is "${label(from)}" cannot be moved to "${label(to)}".` }
  }
  if (hasPendingAdvance && to !== 'CANCELLED') {
    return { ok: false, reason: 'Confirm or reject the customer’s advance payment first.' }
  }
  return { ok: true }
}

const LABELS: Record<OrderStatus, string> = {
  PLACED: 'Placed', CONFIRMED: 'Confirmed', PACKED: 'Packed', SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered', CANCELLED: 'Cancelled', RETURNED: 'Returned',
}
export const label = (s: string) => LABELS[s as OrderStatus] ?? s

export type PaymentSummary = { paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED'; amountPaid: number; amountDue: number }

/** Order payment totals after `received` more money has been confirmed. Never goes over the total. */
export function afterPaymentReceived(total: number, alreadyPaid: number, received: number): PaymentSummary {
  const amountPaid = Math.min(total, Math.max(0, alreadyPaid + received))
  const amountDue = total - amountPaid
  return { amountPaid, amountDue, paymentStatus: amountDue <= 0 ? 'PAID' : amountPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID' }
}

export const COURIERS = [
  { key: 'tcs', name: 'TCS' },
  { key: 'leopards', name: 'Leopards Courier' },
  { key: 'postex', name: 'PostEx' },
  { key: 'other', name: 'Other courier' },
] as const

export const isValidTrackingNo = (v: string) => /^[A-Za-z0-9\-_/]{4,40}$/.test(v)
