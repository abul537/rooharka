import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { clientIp } from '@/lib/rate-limit'

/**
 * Records who changed what. Failure to write the log must never break the action
 * itself, but is printed to the server log.
 */
export async function audit(entry: {
  storeId: string | null
  userId: string | null
  action: string // e.g. "order.status", "settings.payment"
  entity: string
  entityId?: string
  before?: unknown
  after?: unknown
}) {
  try {
    await db.auditLog.create({
      data: {
        storeId: entry.storeId,
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before: (entry.before ?? undefined) as never,
        after: (entry.after ?? undefined) as never,
        ip: clientIp(await headers()),
      },
    })
  } catch (error) {
    console.error('audit log write failed:', error)
  }
}
