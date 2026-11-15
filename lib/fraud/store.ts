import { db } from '@/lib/db'
import { readFraudSettings, type FraudSettings } from '@/lib/fraud/rules'

export async function loadFraudSettings(storeId: string): Promise<FraudSettings> {
  const s = await db.storeSettings.findUnique({ where: { storeId }, select: { extra: true } })
  return readFraudSettings(s?.extra)
}

/** Saves the fake-order check settings, keeping every other key in `extra` (wallets, couriers…). */
export async function saveFraudSettings(storeId: string, value: FraudSettings) {
  await db.$transaction(async (tx) => {
    const current = await tx.storeSettings.findUnique({ where: { storeId }, select: { extra: true } })
    await tx.storeSettings.update({ where: { storeId }, data: { extra: { ...((current?.extra ?? {}) as Record<string, unknown>), fraud: { ...value } } } })
  })
}
