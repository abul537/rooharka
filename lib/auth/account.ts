import { db } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { passwordChangeProblem } from '@/lib/auth/account-rules'
import { destroyOtherSessions } from '@/lib/auth/session'
import { AuthError } from '@/lib/auth/twofactor'
import { rateLimit } from '@/lib/rate-limit'

/**
 * Changes the signed-in person's password. Needs the CURRENT password (so an unlocked, borrowed screen cannot
 * take over the account), applies the same strength rules as account creation, then signs every OTHER browser
 * out (a stolen session stops working) while this one stays signed in.
 */
export async function changePassword(userId: string, input: { current: string; next: string; confirm: string }) {
  if (!rateLimit(`pw-change:${userId}`, 5, 15 * 60_000).ok) throw new AuthError('Too many attempts. Please wait 15 minutes and try again.')
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, passwordHash: true } })
  if (!user) throw new AuthError('Your session has expired. Please sign in again.')

  const problem = passwordChangeProblem({ ...input, current: input.current.slice(0, 200), next: input.next.slice(0, 200), confirm: input.confirm.slice(0, 200), email: user.email })
  if (problem) throw new AuthError(problem)
  if (!(await verifyPassword(input.current.slice(0, 200), user.passwordHash))) throw new AuthError('Your current password is not correct.')

  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(input.next), failedLogins: 0, lockedUntil: null } })
  await destroyOtherSessions(userId)
}
