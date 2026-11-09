import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import { effectiveStaffLimit, posAccess, type PosAccess, type StaffLimit } from './rules'

/** Active logins a store is charged against its limit: managers and staff. The owner is always free. */
export const countStaff = (tx: Pick<typeof db, 'user'> | Prisma.TransactionClient, storeId: string) =>
  tx.user.count({ where: { storeId, isActive: true, role: { in: ['STORE_MANAGER', 'STORE_STAFF'] } } })

export interface Entitlements { staff: StaffLimit & { used: number }; pos: PosAccess; planName: string | null }

/** Everything the platform owner allows this store, in one read. The server calls this before every gated action. */
export async function loadEntitlements(storeId: string): Promise<Entitlements> {
  const [store, used] = await Promise.all([
    db.store.findUnique({ where: { id: storeId }, select: { staffLimit: true, posMode: true, subscription: { select: { plan: { select: { name: true, limits: true, features: true } } } } } }),
    countStaff(db, storeId),
  ])
  const plan = store?.subscription?.plan ?? null
  return {
    staff: { ...effectiveStaffLimit({ storeLimit: store?.staffLimit ?? null, plan }), used },
    pos: posAccess({ mode: store?.posMode ?? 'PLAN', planFeatures: plan?.features ?? null }),
    planName: plan?.name ?? null,
  }
}

/** Just the POS switch (one query): used on every dashboard page to decide whether to show the POS menu entry. */
export async function loadPosAccess(storeId: string): Promise<PosAccess> {
  const s = await db.store.findUnique({ where: { id: storeId }, select: { posMode: true, subscription: { select: { plan: { select: { features: true } } } } } })
  return posAccess({ mode: s?.posMode ?? 'PLAN', planFeatures: s?.subscription?.plan.features ?? null })
}
