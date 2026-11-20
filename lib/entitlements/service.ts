import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import { loadPlanAccess } from '@/lib/plans/access'
import { effectiveStaffLimit, type PosAccess, type StaffLimit } from './rules'

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
    pos: await loadPosAccess(storeId),
    planName: plan?.name ?? null,
  }
}

/** Just the POS switch: used on every dashboard page to decide whether to show the POS menu entry. Same rules as every Pro feature. */
export async function loadPosAccess(storeId: string): Promise<PosAccess> {
  const a = await loadPlanAccess(storeId)
  return { enabled: a.has('pos'), source: a.features.source.pos === 'store' ? 'store' : 'plan' }
}
