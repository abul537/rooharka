import { timingSafeEqual } from 'node:crypto'

export type CronAuth = 'ok' | 'unconfigured' | 'denied'

/** The secret must be long enough that guessing it is hopeless. */
export const MIN_CRON_SECRET = 24

/**
 * Checks the `Authorization: Bearer <CRON_SECRET>` header a scheduler sends (Vercel Cron does this automatically
 * when CRON_SECRET is set). If no secret is configured, EVERY call is refused: a forgotten setting can never leave
 * the job open to the internet.
 */
export function checkCronAuth(authorization: string | null | undefined, secret: string | undefined): CronAuth {
  if (!secret || secret.length < MIN_CRON_SECRET) return 'unconfigured'
  const given = /^Bearer (.+)$/.exec(authorization ?? '')?.[1]
  if (!given) return 'denied'
  const a = Buffer.from(given), b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b) ? 'ok' : 'denied'
}
