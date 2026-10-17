'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { dummyHash, verifyPassword } from '@/lib/auth/password'
import { createSession, destroyCurrentSession, getCurrentUser } from '@/lib/auth/session'
import { isStaffRole } from '@/lib/auth/permissions'
import { clientIp, rateLimit } from '@/lib/rate-limit'

export interface LoginState {
  error?: string
}

const MAX_FAILURES = 5
const LOCK_MINUTES = 15
// One message for every failure so the form never reveals which emails exist.
const GENERIC = 'Invalid email or password, or the account is temporarily locked.'

/** Only same-site dashboard paths are allowed after login (blocks "open redirect" tricks). */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === 'string' ? value : ''
  return next.startsWith('/admin') && !next.startsWith('//') && !next.includes('\\') ? next : '/admin'
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase().slice(0, 254)
  const password = String(formData.get('password') ?? '').slice(0, 200)
  const h = await headers()
  const ip = clientIp(h)

  // Slow down guessing from one address and against one account.
  if (!rateLimit(`login-ip:${ip}`, 20, 15 * 60_000).ok || !rateLimit(`login-email:${email}`, 8, 15 * 60_000).ok) {
    return { error: 'Too many attempts. Please wait 15 minutes and try again.' }
  }
  if (!email || !password) return { error: GENERIC }

  const user = await db.user.findUnique({ where: { email } })
  const locked = !!user?.lockedUntil && user.lockedUntil > new Date()
  // Always do the expensive hash check, even for unknown or locked accounts (same timing).
  const valid = await verifyPassword(password, user && !locked ? user.passwordHash : await dummyHash())

  if (!user || locked || !valid || !user.isActive || !user.storeId || !isStaffRole(user.role)) {
    if (user && !locked) {
      const failures = user.failedLogins + 1
      await db.user.update({
        where: { id: user.id },
        data: failures >= MAX_FAILURES
          ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
          : { failedLogins: failures },
      })
      await audit({ storeId: user.storeId, userId: user.id, action: 'auth.login_failed', entity: 'User', entityId: user.id, after: { failures, locked: failures >= MAX_FAILURES } })
    }
    return { error: GENERIC }
  }

  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } })
  await createSession(user.id, { ip, userAgent: h.get('user-agent') ?? undefined })
  await audit({ storeId: user.storeId, userId: user.id, action: 'auth.login', entity: 'User', entityId: user.id })
  redirect(safeNext(formData.get('next')))
}

export async function logoutAction() {
  const user = await getCurrentUser()
  await destroyCurrentSession()
  if (user) await audit({ storeId: user.storeId, userId: user.id, action: 'auth.logout', entity: 'User', entityId: user.id })
  redirect('/admin/login')
}
