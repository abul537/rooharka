import { db } from '@/lib/db'
import { pktDay } from '@/lib/admin/insights'
import { rateLimit } from '@/lib/rate-limit'
import { ERROR_KEEP_DAYS, errorFingerprint, isNoise, pageKind, safeMessage } from '@/lib/errors/rules'

/**
 * Keeps a note of one crash. Never throws (a failure to record must not cause a second failure), at most 120
 * a minute for the whole platform, and the same error on the same day only raises a counter.
 */
export async function recordError(e: { kind: 'server' | 'client'; path: unknown; message: unknown; digest?: string | null; storeId?: string | null }): Promise<void> {
  try {
    const message = safeMessage(e.message)
    if (isNoise(message, e.digest) || !rateLimit('error-events', 120, 60_000).ok) return
    const path = pageKind(e.path), day = pktDay(new Date()), fingerprint = errorFingerprint(e.kind, path, message)
    await db.errorEvent.upsert({
      where: { day_fingerprint: { day, fingerprint } },
      create: { day, fingerprint, kind: e.kind, path, message, digest: e.digest?.slice(0, 60) ?? null, storeId: e.storeId ?? null },
      update: { count: { increment: 1 }, lastAt: new Date() },
    })
  } catch (err) { console.error('[errors] could not record', err instanceof Error ? err.message : err) }
}
export const pruneErrors = (now = new Date()) => db.errorEvent.deleteMany({ where: { lastAt: { lt: new Date(now.getTime() - ERROR_KEEP_DAYS * 86_400_000) } } }).then((r) => r.count).catch(() => 0)
