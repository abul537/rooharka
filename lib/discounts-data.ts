import { db } from '@/lib/db'
import type { DiscountRule } from '@/lib/discounts'

/** One code of ONE store (a code of another store does not exist here), with money as plain numbers. */
export async function findDiscount(storeId: string, code: string): Promise<(DiscountRule & { id: string }) | null> {
  const d = await db.discount.findUnique({ where: { storeId_code: { storeId, code } } })
  return d ? { id: d.id, code: d.code, kind: d.kind, value: d.value.toNumber(), minSubtotal: d.minSubtotal.toNumber(), maxUses: d.maxUses, usedCount: d.usedCount, oncePerCustomer: d.oncePerCustomer, startsAt: d.startsAt, endsAt: d.endsAt, isActive: d.isActive } : null
}
