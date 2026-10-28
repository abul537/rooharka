import { db } from '@/lib/db'
import { decryptJson, encryptJson, hmacHex } from '@/lib/secrets'
import { verifyPassword } from '@/lib/auth/password'
import {
  cleanTotp, generateRecoveryCodes, generateSecret, groupKey, looksLikeRecovery, normalizeRecovery, otpauthUri, verifyTotp,
} from '@/lib/auth/totp'

/** A problem whose message is safe to show to the person signed in. */
export class AuthError extends Error {}

const ISSUER = 'Rooharka'
const recoveryHash = (code: string) => hmacHex('recovery', normalizeRecovery(code))

export interface FactorUser { id: string; twoFactorSecretEnc: string | null; twoFactorRecovery: string[]; twoFactorLastStep: number | null }

/**
 * Accepts either a 6-digit app code or a recovery code, and USES it up in one atomic database step:
 *  - app code: the time step is recorded, so the same code can never be accepted twice;
 *  - recovery code: removed from the list, so it works exactly once.
 * Two requests racing with the same code cannot both succeed. Returns how it was proven, or null.
 */
export async function consumeSecondFactor(user: FactorUser, input: string, now = Date.now()): Promise<'app' | 'recovery' | null> {
  if (looksLikeRecovery(input)) {
    const hash = recoveryHash(input)
    if (!user.twoFactorRecovery.includes(hash)) return null
    const removed = await db.$executeRaw`UPDATE "User" SET "twoFactorRecovery" = array_remove("twoFactorRecovery", ${hash}) WHERE "id" = ${user.id} AND ${hash} = ANY("twoFactorRecovery")`
    return removed === 1 ? 'recovery' : null
  }
  if (!user.twoFactorSecretEnc) return null
  let secret: string
  try { secret = decryptJson<string>(user.twoFactorSecretEnc) } catch { return null } // unreadable (APP_SECRET changed): refuse, never let in
  const step = verifyTotp(secret, cleanTotp(input), now, user.twoFactorLastStep)
  if (step === null) return null
  const claimed = await db.user.updateMany({
    where: { id: user.id, OR: [{ twoFactorLastStep: null }, { twoFactorLastStep: { lt: step } }] },
    data: { twoFactorLastStep: step },
  })
  return claimed.count === 1 ? 'app' : null
}

const load = (userId: string) => db.user.findUnique({
  where: { id: userId },
  select: { id: true, email: true, passwordHash: true, twoFactorEnabled: true, twoFactorSecretEnc: true, twoFactorRecovery: true, twoFactorLastStep: true },
})

/** Step 1 of turning protection on: makes a fresh secret (not active yet) for the phone app. */
export async function beginEnrollment(userId: string) {
  const user = await load(userId)
  if (!user) throw new AuthError('Your session has expired. Please sign in again.')
  if (user.twoFactorEnabled) throw new AuthError('Two-factor protection is already on. Turn it off first to set it up again.')
  const secret = generateSecret()
  await db.user.update({ where: { id: userId }, data: { twoFactorSecretEnc: encryptJson(secret), twoFactorEnabled: false, twoFactorLastStep: null, twoFactorRecovery: [] } })
  return { key: groupKey(secret), uri: otpauthUri(ISSUER, user.email, secret) }
}

/** Step 2: the person types the code their app shows, proving the app is set up. Returns the recovery codes ONCE. */
export async function confirmEnrollment(userId: string, code: string, now = Date.now()) {
  const user = await load(userId)
  if (!user) throw new AuthError('Your session has expired. Please sign in again.')
  if (user.twoFactorEnabled) throw new AuthError('Two-factor protection is already on.')
  if (!user.twoFactorSecretEnc) throw new AuthError('Start the setup again to get a new key.')
  let secret: string
  try { secret = decryptJson<string>(user.twoFactorSecretEnc) } catch { throw new AuthError('Start the setup again to get a new key.') }
  const step = verifyTotp(secret, code, now)
  if (step === null) throw new AuthError('That code is not right. Check the 6 digits in your app (they change every 30 seconds) and try again.')
  const codes = generateRecoveryCodes()
  await db.user.update({ where: { id: userId }, data: { twoFactorEnabled: true, twoFactorLastStep: step, twoFactorRecovery: codes.map(recoveryHash) } })
  return { recoveryCodes: codes }
}

/** Proves who is asking before a sensitive change: the password AND a current code (app or recovery). */
async function reverify(userId: string, password: string, code: string) {
  const user = await load(userId)
  if (!user || !user.twoFactorEnabled) throw new AuthError('Two-factor protection is not on.')
  if (!(await verifyPassword(password.slice(0, 200), user.passwordHash))) throw new AuthError('Your password is not correct.')
  if (!(await consumeSecondFactor(user, code))) throw new AuthError('That code is not right.')
}

/** Turns protection off. Needs the password and a current code, so a borrowed, unlocked session cannot remove it. */
export async function disableTwoFactor(userId: string, password: string, code: string) {
  await reverify(userId, password, code)
  await db.user.update({ where: { id: userId }, data: { twoFactorEnabled: false, twoFactorSecretEnc: null, twoFactorRecovery: [], twoFactorLastStep: null } })
}

/** A fresh set of recovery codes; the old ones stop working. */
export async function regenerateRecoveryCodes(userId: string, password: string, code: string) {
  await reverify(userId, password, code)
  const codes = generateRecoveryCodes()
  await db.user.update({ where: { id: userId }, data: { twoFactorRecovery: codes.map(recoveryHash) } })
  return { recoveryCodes: codes }
}

export async function twoFactorStatus(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true, twoFactorRecovery: true } })
  return { enabled: !!u?.twoFactorEnabled, recoveryLeft: u?.twoFactorRecovery.length ?? 0 }
}
