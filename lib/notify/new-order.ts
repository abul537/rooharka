import { db } from '@/lib/db'
import { notifyOrder, notifyOwnerNewOrder } from '@/lib/notify/send'

/** Right after checkout: the "order received" message to the customer and the new-order email to the owner. Never throws. */
export async function announceNewOrder(storeId: string, number: string, origin: string | null): Promise<void> {
  try {
    const o = await db.order.findFirst({ where: { storeId, number }, select: { id: true } })
    if (!o) return
    await Promise.all([notifyOrder(storeId, o.id), notifyOwnerNewOrder(storeId, o.id, origin)])
  } catch (e) { console.error('[notify] new order', e instanceof Error ? e.message : e) }
}
