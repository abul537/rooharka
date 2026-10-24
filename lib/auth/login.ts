import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { dummyHash, verifyPassword } from '@/lib/auth/password'
import { createSession } from '@/lib/auth/session'
import { isStaffRole } from '@/lib/auth/permissions'
import { isPlatformRole } from '@/lib/csmi/rules'
import { rateLimit } from '@/lib/rate-limit'

const MAX_FAILURES = 5
const LOCK_MINUTES = 15
// One message for every failure so a form never reveals which emails exist.
export const GENERIC_LOGIN_ERROR = 'Invalid email or password, or the account is temporarily locked.'

export type LoginArea = 'store' | 'platform'

/**
 * The ONE login routine for both dashboards: rate limits, lockout after 5 wrong passwords, identical timing and
 * message for every failure, audit trail. `area` decides who may enter here: store staff only through the store
 * dashboard, platform staff only through CSMI, so a credential for one can never open the other.
 */
export async function attemptLogin(input: { email: string; password: string; ip: string; userAgent?: string; area: LoginArea }): Promise<{ error: string } | { ok: true }> {
  const email = input.email.trim().toLowerCase().slice(0, 254)
  const password = input.password.slice(0, 200)

  // Slow down guessing from one address and against one account. The owner area is stricter.
  const ipLimit = input.area === 'platform' ? 10 : 20
  if (!rateLimit(`login-ip:${input.area}:${input.ip}`, ipLimit, 15 * 60_000).ok || !rateLimit(`login-email:${email}`, 8, 15 * 60_000).ok) {
    return { error: 'Too many attempts. Please wait 15 minutes and try again.' }
  }
  if (!email || !password) return { error: GENERIC_LOGIN_ERROR }

  const user = await db.user.findUnique({ where: { email } })
  const locked = !!user?.lockedUntil && user.lockedUntil > new Date()
  // Always do the expensive hash check, even for unknown or locked accounts (same timing).
  const valid = await verifyPassword(password, user && !locked ? user.passwordHash : await dummyHash())
  const mayEnter = !!user && (input.area === 'platform' ? user.storeId === null && isPlatformRole(user.role) : !!user.storeId && isStaffRole(user.role))

  if (!user || locked || !valid || !user.isActive || !mayEnter) {
    if (user && !locked) {
      const failures = user.failedLogins + 1
      await db.user.update({
        where: { id: user.id },
        data: failures >= MAX_FAILURES ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLogins: failures },
      })
      await audit({ storeId: user.storeId, userId: user.id, action: 'auth.login_failed', entity: 'User', entityId: user.id, after: { failures, locked: failures >= MAX_FAILURES, area: input.area } })
    }
    return { error: GENERIC_LOGIN_ERROR }
  }

  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } })
  await createSession(user.id, { ip: input.ip, userAgent: input.userAgent })
  await audit({ storeId: user.storeId, userId: user.id, action: 'auth.login', entity: 'User', entityId: user.id, after: { area: input.area } })
  return { ok: true }
}
