'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { AdminError, addCustomerUpdate, changeOrderStatus } from '@/lib/admin/orders'
import { label, type OrderStatus } from '@/lib/admin/order-rules'
import { parseCustomerNote } from '@/lib/admin/order-tracking'
import { rateLimit } from '@/lib/rate-limit'

type Result = { ok: string } | { error: string }
/** Cancelling is not offered here: it restocks and may mean a refund, so it stays on the order's own page. */
const TARGETS: OrderStatus[] = ['CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED']
const fail = (e: unknown): Result => {
  if (e instanceof AdminError) return { error: e.message }
  console.error('[order tracking]', e)
  return { error: 'Something went wrong. Nothing was changed; please try again.' }
}
const refresh = (orderId: string) => { for (const p of ['/admin/order-tracking', '/admin/orders', `/admin/orders/${orderId}`, '/admin']) revalidatePath(p) }

/**
 * Moves an order to its next step, with an optional note for the customer. It goes through the same
 * `changeOrderStatus` as every other status button: same allowed steps, same check for an unconfirmed advance,
 * same protection when two people change one order at once, and only an order of the admin's own store.
 */
export async function trackStatusAction(orderId: unknown, to: unknown, note: unknown): Promise<Result> {
  const g = await adminOrError('orders.update'); if ('error' in g) return g
  if (typeof orderId !== 'string' || !TARGETS.includes(to as OrderStatus)) return { error: 'Invalid request. Reload the page.' }
  if (!rateLimit(`order-track:${g.admin.id}`, 120, 60_000).ok) return { error: 'Too fast. Please wait a moment.' }
  try {
    const r = await changeOrderStatus(g.admin, orderId, to as OrderStatus, parseCustomerNote(note) ?? undefined)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'order.status', entity: 'Order', entityId: orderId, before: { status: r.before }, after: { status: r.after } })
    refresh(orderId)
    return { ok: `Order #${r.number} is now ${label(r.after).toLowerCase()}. The customer can see it.` }
  } catch (e) { return fail(e) }
}

/** Posts a message on the customer's tracking page without changing the status. */
export async function trackNoteAction(orderId: unknown, note: unknown): Promise<Result> {
  const g = await adminOrError('orders.update'); if ('error' in g) return g
  const text = parseCustomerNote(note)
  if (typeof orderId !== 'string' || !text) return { error: 'Write the message for the customer first.' }
  if (!rateLimit(`order-track:${g.admin.id}`, 120, 60_000).ok) return { error: 'Too fast. Please wait a moment.' }
  try {
    const r = await addCustomerUpdate(g.admin, orderId, text)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'order.note', entity: 'Order', entityId: orderId, after: { status: r.status, note: text } })
    refresh(orderId)
    return { ok: `Message added to order #${r.number}. The customer can see it.` }
  } catch (e) { return fail(e) }
}
