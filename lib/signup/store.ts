import { db } from '@/lib/db'
import { memoAsync } from '@/lib/memo'
import type { Prisma } from '@/lib/generated/prisma/client'
import { DEFAULT_SETTINGS, readSettings, type PlatformSettings } from '@/lib/signup/settings'

const KEY = 'platform'
const cached = memoAsync(15_000, async () => readSettings((await db.platformSetting.findUnique({ where: { key: KEY } }))?.value))

/** Platform settings, remembered for 15 seconds (the public pages read them on every view). A database error falls back to the SAFE defaults (sign-ups closed). */
export const getPlatformSettings = (): Promise<PlatformSettings> => cached.get().catch(() => DEFAULT_SETTINGS)

export async function savePlatformSettings(s: PlatformSettings) {
  const value = s as unknown as Prisma.InputJsonValue
  await db.platformSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } })
  cached.clear()
}
