import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { dummyHash, verifyPassword } from '@/lib/auth/password'
import { createSession } from '@/lib/auth/session'
import { isStaffRole } from '@/lib/auth/permissions'
import { consumeSecondFactor } from '@/lib/auth/twofactor'
import { isPlatformRole } from '@/lib/csmi/rules'
import { rateLimit } from '@/lib/rate-limit'
import { signToken, verifyToken } from '@/lib/secrets'

const MAX_FAILURES = 5
const LOCK_MINUTES = 15
const CODE_WINDOW_SECONDS = 5 * 60
const IS_PROD = process.env.NODE_ENV === 'production'
// "__Host-" makes the browser refuse the cookie unless it is Secure, path "/" and has no Domain.
const PENDING_COOKIE = IS_PROD ? '__Host-rk_2fa' : 'rk_2fa'
// One message for every failure so a form never reveals which emails exist.
export const GENERIC_LOGIN_ERROR = 'Invalid email or password, or the account is temporarily locked.'
export const CODE_ERROR = 'That code is not right. Check the 6 digits in your app, or use a recovery code.'
const EXPIRED = 'Your sign-in took too long. Please enter your email and password again.'

export type LoginArea = 'store' | 'platform'
export type LoginResult = { error: string } | { ok: true } | { needsCode: true }

type LoginUser = NonNullable<Awaited<ReturnType<typeof findUser>>>
const findUser = (where: { email: string } | { id: string }) => db.user.findUnique({ where })

/** Store staff may enter only through the store dashboard, platform staff only through CSMI. */
const mayEnter = (user: { storeId: string | null; role: string }, area: LoginArea) =>
  area === 'platform' ? user.storeId === null && isPlatformRole(user.role) : !!user.storeId && isStaffRole(user.role)

/** Counts a failed attempt; five in a row lock the account for 15 minutes. */
async function recordFailure(user: LoginUser, area: LoginArea, why: 'password' | 'code') {
  const failures = user.failedLogins + 1
  await db.user.update({
    where: { id: user.id },
    data: failures >= MAX_FAILURES ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLogins: failures },
  })
  await audit({ storeId: user.storeId, userId: user.id, action: why === 'code' ? 'auth.2fa_failed' : 'auth.login_failed', entity: 'User', entityId: user.id, after: { failures, locked: failures >= MAX_FAILURES, area } })
}

async function finish(user: LoginUser, meta: { ip: string; userAgent?: string }, area: LoginArea, method: 'password' | 'app' | 'recovery') {
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } })
  await createSession(user.id, meta)
  await audit({ storeId: user.storeId, userId: user.id, action: 'auth.login', entity: 'User', entityId: user.id, after: { area, method } })
}

/**
 * The ONE login routine for both dashboards: rate limits, lockout after 5 wrong passwords, identical timing and
 * message for every failure, audit trail. `area` decides who may enter here.
 *
 * When the account has two-factor protection, a correct password is NOT enough: no session is created yet.
 * A short-lived signed "password was right" cookie is set and `{ needsCode: true }` is returned; the person
 * then proves the second factor with `attemptSecondFactor`.
 */
export async function attemptLogin(input: { email: string; password: string; ip: string; userAgent?: string; area: LoginArea }): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase().slice(0, 254)
  const password = input.password.slice(0, 200)

  // Slow down guessing from one address and against one account. The owner area is stricter.
  const ipLimit = input.area === 'platform' ? 10 : 20
  if (!rateLimit(`login-ip:${input.area}:${input.ip}`, ipLimit, 15 * 60_000).ok || !rateLimit(`login-email:${email}`, 8, 15 * 60_000).ok) {
    return { error: 'Too many attempts. Please wait 15 minutes and try again.' }
  }
  if (!email || !password) return { error: GENERIC_LOGIN_ERROR }

  const user = await findUser({ email })
  const locked = !!user?.lockedUntil && user.lockedUntil > new Date()
  // Always do the expensive hash check, even for unknown or locked accounts (same timing).
  const valid = await verifyPassword(password, user && !locked ? user.passwordHash : await dummyHash())

  if (!user || locked || !valid || !user.isActive || !mayEnter(user, input.area)) {
    if (user && !locked) await recordFailure(user, input.area, 'password')
    return { error: GENERIC_LOGIN_ERROR }
  }

  if (user.twoFactorEnabled) {
    // Fail closed: protection is on but the secret is missing, so nobody gets in until it is reset.
    if (!user.twoFactorSecretEnc) return { error: GENERIC_LOGIN_ERROR }
    ;(await cookies()).set(PENDING_COOKIE, signToken('login2fa', { uid: user.id, area: input.area }, CODE_WINDOW_SECONDS), {
      httpOnly: true, secure: IS_PROD, sameSite: 'lax', path: '/', maxAge: CODE_WINDOW_SECONDS,
    })
    return { needsCode: true }
  }

  await finish(user, input, input.area, 'password')
  return { ok: true }
}

/** Second step: the 6-digit app code or a recovery code, for a person whose password was already accepted. */
export async function attemptSecondFactor(input: { code: string; ip: string; userAgent?: string; area: LoginArea }): Promise<LoginResult> {
  const jar = await cookies()
  const pending = verifyToken<{ uid: string; area: string }>('login2fa', jar.get(PENDING_COOKIE)?.value)
  if (!pending || pending.area !== input.area) return { error: EXPIRED }

  if (!rateLimit(`2fa-user:${pending.uid}`, 10, 15 * 60_000).ok || !rateLimit(`2fa-ip:${input.ip}`, 30, 15 * 60_000).ok) {
    return { error: 'Too many attempts. Please wait 15 minutes and try again.' }
  }
  const user = await findUser({ id: pending.uid })
  if (!user || !user.isActive || !user.twoFactorEnabled || !mayEnter(user, input.area)) { jar.delete(PENDING_COOKIE); return { error: EXPIRED } }
  if (user.lockedUntil && user.lockedUntil > new Date()) return { error: GENERIC_LOGIN_ERROR }

  const method = await consumeSecondFactor(user, input.code.slice(0, 40))
  if (!method) {
    await recordFailure(user, input.area, 'code')
    return { error: CODE_ERROR }
  }
  jar.delete(PENDING_COOKIE)
  await finish(user, input, input.area, method)
  return { ok: true }
}

/** "Start again" on the code step: forget that the password was accepted. */
export async function cancelSecondFactor() {
  ;(await cookies()).delete(PENDING_COOKIE)
}
