import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import { loadServiceViews } from '@/lib/services/store-services'
import { ADAPTERS } from '@/lib/couriers/adapters'
import { readCourierConfig, type CourierConfig } from '@/lib/couriers/config'

export async function loadCourierConfig(storeId: string): Promise<CourierConfig> {
  const s = await db.storeSettings.findUnique({ where: { storeId }, select: { extra: true } })
  return readCourierConfig(s?.extra)
}

/** The config plus which couriers have the owner's own account connected (those can be booked automatically). */
export async function loadCourierSetup(storeId: string) {
  const [config, views] = await Promise.all([loadCourierConfig(storeId), loadServiceViews(storeId)])
  const connected = new Set(Object.keys(ADAPTERS).filter((k) => { const v = views.get(k); return !!v?.enabled && v.configured }))
  return { config, connected, views }
}

export async function saveCourierConfig(storeId: string, config: CourierConfig) {
  await db.$transaction(async (tx) => {
    const current = await tx.storeSettings.findUnique({ where: { storeId }, select: { extra: true } })
    // Keep every other key in `extra` (wallets etc.); only replace the courier list.
    const extra = { ...((current?.extra ?? {}) as Record<string, unknown>), couriers: { enabled: config.enabled, default: config.defaultKey, custom: config.custom } } as Prisma.InputJsonValue
    await tx.storeSettings.update({ where: { storeId }, data: { extra } })
  })
}
