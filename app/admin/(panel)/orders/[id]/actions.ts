'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { AdminError, addShipment, cancelOrder, changeOrderStatus, confirmPayment, rejectPayment } from '@/lib/admin/orders'
import type { OrderStatus } from '@/lib/admin/order-rules'
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
