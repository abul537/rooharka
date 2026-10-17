import { createHash, randomBytes } from 'node:crypto'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'

/**
 * Sessions live in the database. The browser holds only a random token in an
 * httpOnly cookie (JavaScript cannot read it); the database stores just a SHA-256
 * hash of it, so a leaked database cannot be used to log in.
 */
const IS_PROD = process.env.NODE_ENV === 'production'
// "__Host-" makes the browser refuse the cookie unless it is Secure, path "/" and has no Domain.
export const SESSION_COOKIE = IS_PROD ? '__Host-rk_session' : 'rk_session'

const SESSION_DAYS = 7
const DAY = 24 * 60 * 60 * 1000
const TOUCH_AFTER = 10 * 60 * 1000 // refresh "last used" at most every 10 minutes

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

export async function createSession(userId: string, meta: { ip?: string; userAgent?: string }) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY)
  await db.session.create({
    data: { userId, tokenHash: sha256(token), ip: meta.ip?.slice(0, 64), userAgent: meta.userAgent?.slice(0, 255), expiresAt },
  })
  ;(await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export interface CurrentUser {
  id: string
  email: string
  name: string
  role: string
  storeId: string | null
}

/** The signed-in user for this request, or null. Cached so a page asks the database once. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token || token.length > 200) return null

  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true, storeId: true, isActive: true } } },
  })
  if (!session || session.expiresAt <= new Date() || !session.user.isActive) return null

  if (Date.now() - session.lastUsedAt.getTime() > TOUCH_AFTER) {
    // Active people stay signed in; idle sessions simply expire.
    const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY)
    await db.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date(), expiresAt } }).catch(() => {})
  }
  const { isActive: _ignored, ...user } = session.user
  return user
})

export async function destroyCurrentSession() {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } })
  jar.delete(SESSION_COOKIE)
}

/** Signs a user out everywhere (used after a password change). */
export const destroyAllSessions = (userId: string) => db.session.deleteMany({ where: { userId } })
