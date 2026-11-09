import { db } from '@/lib/db'
import type { StoreAdmin } from '@/lib/auth/guard'
import { hashPassword } from '@/lib/auth/password'
import { destroyAllSessions } from '@/lib/auth/session'
import { effectiveStaffLimit, staffSlotProblem } from '@/lib/entitlements/rules'
import { countStaff } from '@/lib/entitlements/service'
import type { Prisma } from '@/lib/generated/prisma/client'
import type { NewMember } from './rules'

/** An error whose message is safe to show to the store owner. */
export class TeamError extends Error {}

/**
 * Runs `work` while holding a lock on the store row, so two owners' tabs (or a double click) can never both take
 * the last free staff slot: the second one waits, then sees the slot is gone.
 */
async function withStoreLock<T>(storeId: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`
    return work(tx)
  })
}

async function slotProblem(tx: Prisma.TransactionClient, storeId: string): Promise<string | null> {
  const store = await tx.store.findUnique({ where: { id: storeId }, select: { staffLimit: true, subscription: { select: { plan: { select: { limits: true } } } } } })
  const limit = effectiveStaffLimit({ storeLimit: store?.staffLimit ?? null, plan: store?.subscription?.plan ?? null })
  return staffSlotProblem(await countStaff(tx, storeId), limit)
}

/** The target must be a manager or staff member of the caller's own store, never the owner and never anyone else's. */
async function loadMember(tx: Pick<Prisma.TransactionClient, 'user'>, admin: StoreAdmin, userId: string) {
  const u = await tx.user.findFirst({ where: { id: userId, storeId: admin.storeId, role: { in: ['STORE_MANAGER', 'STORE_STAFF'] } }, select: { id: true, email: true, name: true, isActive: true } })
  if (!u) throw new TeamError('That team member was not found.')
  return u
}

export async function addMember(admin: StoreAdmin, m: NewMember) {
  const passwordHash = await hashPassword(m.password) // slow on purpose, so done before taking the lock
  try {
    return await withStoreLock(admin.storeId, async (tx) => {
      const problem = await slotProblem(tx, admin.storeId)
      if (problem) throw new TeamError(problem)
      return tx.user.create({ data: { storeId: admin.storeId, email: m.email, name: m.name, role: m.role, passwordHash }, select: { id: true, email: true, role: true } })
    })
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002') throw new TeamError('That email already has a login. Use a different email address.')
    throw e
  }
}

/** Switch a member off (signs them out everywhere at once) or back on (needs a free slot). */
export async function setMemberActive(admin: StoreAdmin, userId: string, active: boolean) {
  const u = await withStoreLock(admin.storeId, async (tx) => {
    const member = await loadMember(tx, admin, userId)
    if (member.isActive === active) return member
    if (active) { const problem = await slotProblem(tx, admin.storeId); if (problem) throw new TeamError(problem) }
    await tx.user.update({ where: { id: member.id }, data: { isActive: active } })
    return member
  })
  if (!active) await destroyAllSessions(u.id)
  return u
}

/** The owner sets a new password for a member (for example one who forgot theirs) and signs them out everywhere. */
export async function resetMemberPassword(admin: StoreAdmin, userId: string, password: string) {
  const member = await loadMember(db, admin, userId)
  await db.user.update({ where: { id: member.id }, data: { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null } })
  await destroyAllSessions(member.id)
  return member
}
