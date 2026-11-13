'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { AdminError, changeOrderStatus } from '@/lib/admin/orders'
import { ORDER_BULK_TARGET, parseBulkStep, type BulkLine } from '@/lib/admin/order-list'
import { rateLimit } from '@/lib/rate-limit'

/**
 * One small group of a bulk action (at most 5 orders). The page sends group after group and draws the progress
 * bar from the answers, so no request runs long and a failure in one order never stops the others.
 * Each order goes through the same `changeOrderStatus` as the button on its own page: same rules, same history
 * line for the customer, same protection against two people changing it at once, and only this store's orders.
 */
export async function bulkOrderStepAction(action: unknown, ids: unknown): Promise<{ lines: BulkLine[] } | { error: string }> {
  const g = await adminOrError('orders.update'); if ('error' in g) return g
  const p = parseBulkStep(action, ids); if (!p.ok) return { error: p.error }
  if (!rateLimit(`order-bulk:${g.admin.id}`, 120, 60_000).ok) return { error: 'Too fast. Please wait a moment and continue.' }
  const to = ORDER_BULK_TARGET[p.action]
  const lines: BulkLine[] = []
  for (const id of p.ids) {
    try {
      const r = await changeOrderStatus(g.admin, id, to)
      await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'order.status', entity: 'Order', entityId: id, before: { status: r.before }, after: { status: r.after, bulk: true } })
      lines.push({ id, number: r.number, ok: true, message: 'Done' })
    } catch (e) {
      if (!(e instanceof AdminError)) console.error('[order bulk]', e)
      lines.push({ id, number: null, ok: false, message: e instanceof AdminError ? e.message : 'Something went wrong; this order was not changed.' })
    }
  }
  revalidatePath('/admin/orders'); revalidatePath('/admin')
  return { lines }
}
