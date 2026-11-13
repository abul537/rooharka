/**
 * Counting shop visitors without cookies and without storing anything personal.
 * A visitor is a keyed hash of (store, day, IP address, browser): it is the same for one person during one day,
 * different the next day, different on every store, and cannot be turned back into an IP address.
 */
import { db } from '@/lib/db'
import { hmacHex } from '@/lib/secrets'
import { VISIT_KEEP_DAYS, pktDay } from '@/lib/admin/insights'

export const visitorKey = (storeId: string, day: string, ip: string, userAgent: string) => hmacHex('visitor', `${storeId}|${day}|${ip}|${userAgent}`).slice(0, 32)

/** One page view (`view` = true) or a "still here" signal that only moves the last-seen time. */
export async function recordVisit(storeId: string, ip: string, userAgent: string, view: boolean, now = new Date()) {
  const day = pktDay(now)
  const key = visitorKey(storeId, day, ip, userAgent)
  await db.visitorDay.upsert({
    where: { storeId_day_visitorKey: { storeId, day, visitorKey: key } },
    create: { storeId, day, visitorKey: key, views: 1, firstAt: now, lastSeenAt: now },
    update: { lastSeenAt: now, ...(view ? { views: { increment: 1 } } : {}) },
  })
}

/** Daily clean-up: visitor rows older than 120 days are not needed for any report. */
export async function pruneVisits(now = new Date()): Promise<number> {
  return (await db.visitorDay.deleteMany({ where: { lastSeenAt: { lt: new Date(now.getTime() - VISIT_KEEP_DAYS * 86_400_000) } } })).count
}
