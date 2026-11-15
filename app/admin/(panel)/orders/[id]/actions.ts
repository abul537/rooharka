'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { autoBookOrder } from '@/lib/couriers/booking'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { AdminError, addShipment, bookShipment, cancelOrder, changeOrderStatus, confirmPayment, rejectPayment } from '@/lib/admin/orders'
import type { OrderStatus } from '@/lib/admin/order-rules'
import { syncOrder } from '@/lib/couriers/sync'
import { approveHeldOrder, verifyOrder } from '@/lib/fraud/verify'
import { VERDICT_TEXT } from '@/lib/fraud/rules'
import { rateLimit } from '@/lib/rate-limit'
import type { ActionState } from '@/components/admin/ActionForm'

const STATUSES = ['CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED']
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '')

function fail(e: unknown): ActionState {
  if (e instanceof AdminError) return { error: e.message }
  console.error('[admin order action]', e)
  return { error: 'Something went wrong. Nothing was changed; please try again.' }
}
function done(orderId: string, ok: string): ActionState {
  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  revalidatePath('/admin/order-tracking')
  revalidatePath('/admin')
  return { ok }
}

export async function statusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('orders.update'); if ('error' in g) return g
  const orderId = str(fd, 'orderId'), to = str(fd, 'to')
  if (!STATUSES.includes(to)) return { error: 'Invalid status.' }
  try {
    const r = await changeOrderStatus(g.admin, orderId, to as OrderStatus, str(fd, 'note'))
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'order.status', entity: 'Order', entityId: orderId, before: { status: r.before }, after: { status: r.after } })
    return done(orderId, `Order #${r.number} is now ${to.toLowerCase().replace(/_/g, ' ')}.`)
  } catch (e) { return fail(e) }
}

export async function cancelAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('orders.cancel'); if ('error' in g) return g
  const orderId = str(fd, 'orderId')
  try {
    const r = await cancelOrder(g.admin, orderId, str(fd, 'reason'))
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'order.cancel', entity: 'Order', entityId: orderId, before: { status: r.before }, after: { status: 'CANCELLED', refundDue: r.refundDue } })
    return done(orderId, r.refundDue > 0 ? `Cancelled. Remember to refund Rs. ${r.refundDue.toLocaleString('en-PK')} to the customer.` : 'Order cancelled and stock restored.')
  } catch (e) { return fail(e) }
}

export async function paymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('payments.confirm'); if ('error' in g) return g
  const orderId = str(fd, 'orderId'), paymentId = str(fd, 'paymentId'), decision = str(fd, 'decision')
  if (decision !== 'confirm' && decision !== 'reject') return { error: 'Invalid choice.' }
  try {
    const r = decision === 'confirm' ? await confirmPayment(g.admin, orderId, paymentId) : await rejectPayment(g.admin, orderId, paymentId)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: `payment.${decision}`, entity: 'Payment', entityId: paymentId, after: { orderId, reference: r.reference } })
    // The advance is in: now the parcel can be booked with the courier (safe if it was already booked).
    if (decision === 'confirm') after(() => autoBookOrder(g.admin.storeId, orderId).catch((e) => console.error('[auto booking] after payment failed', e instanceof Error ? e.message : e)))
    return done(orderId, decision === 'confirm' ? 'Payment confirmed.' : 'Payment rejected.')
  } catch (e) { return fail(e) }
}

export async function shipmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('orders.update'); if ('error' in g) return g
  const orderId = str(fd, 'orderId')
  try {
    const r = await addShipment(g.admin, orderId, str(fd, 'courier'), str(fd, 'trackingNo'))
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'order.shipment', entity: 'Order', entityId: orderId, after: { courier: r.courier, trackingNo: r.trackingNo } })
    return done(orderId, 'Shipment added; the customer can now see it when tracking.')
  } catch (e) { return fail(e) }
}

/**
 * The fake-order check on one order: "approve" lifts a hold after the owner checked the order themselves (then
 * the parcel is booked, as it would have been); "recheck" runs the check again with today's history.
 */
export async function verificationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('orders.update'); if ('error' in g) return g
  const orderId = str(fd, 'orderId'), decision = str(fd, 'decision')
  try {
    if (decision === 'approve') {
      const r = await approveHeldOrder(g.admin, orderId)
      if (!r) return { error: 'This order is not on hold any more. Refresh the page.' }
      await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'order.verification.approve', entity: 'Order', entityId: orderId, after: { status: 'CLEAR', by: 'owner' } })
      after(() => autoBookOrder(g.admin.storeId, orderId).catch((e) => console.error('[auto booking] after approval failed', e instanceof Error ? e.message : e)))
      return done(orderId, `Order #${r.number} is approved and can be fulfilled.`)
    }
    if (decision === 'recheck') {
      if (!rateLimit(`fraud-recheck:${g.admin.id}`, 30, 60_000).ok) return { error: 'Too many checks at once. Please wait a minute.' }
      const d = await verifyOrder(g.admin.storeId, orderId, { again: true, userId: g.admin.id })
      if (!d) return { error: 'This order is not checked: only cash-on-delivery orders placed online are, and only while the check is switched on in Settings.' }
      return done(orderId, `Checked again: ${VERDICT_TEXT[d.status].label}.`)
    }
    return { error: 'Invalid choice.' }
  } catch (e) { return fail(e) }
}

/** Books the parcel through the courier's API (the store's own account), then records it. */
export async function bookCourierAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('orders.update'); if ('error' in g) return g
  const orderId = str(fd, 'orderId')
  try {
    const r = await bookShipment(g.admin, orderId, str(fd, 'courier'))
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'order.shipment.auto', entity: 'Order', entityId: orderId, after: { courier: r.courier, trackingNo: r.trackingNo } })
    return done(orderId, `Booked with ${r.name}. Tracking number ${r.trackingNo} was saved and the customer can see it.`)
  } catch (e) { return fail(e) }
}

/** Asks the courier where the parcel is right now (read-only towards the courier) and shows what it said. */
export async function refreshCourierAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('orders.update'); if ('error' in g) return g
  const orderId = str(fd, 'orderId')
  try {
    const r = await syncOrder(g.admin, orderId)
    done(orderId, '')
    return { ok: r.lines.join(' ') }
  } catch (e) { return fail(e) }
}
