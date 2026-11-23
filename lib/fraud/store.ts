import { db } from '@/lib/db'
import { saveExtra } from '@/lib/admin/extra'
import { readFraudSettings, type FraudSettings } from '@/lib/fraud/rules'

export async function loadFraudSettings(storeId: string): Promise<FraudSettings> {
  const s = await db.storeSettings.findUnique({ where: { storeId }, select: { extra: true } })
  return readFraudSettings(s?.extra)
}

/** Saves the fake-order check settings, keeping every other key in `extra` (wallets, couriers…). */
export async function saveFraudSettings(storeId: string, value: FraudSettings) {
  await saveExtra(storeId, 'fraud', value)
}
