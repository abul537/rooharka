import { db } from '@/lib/db'
import { memoAsync } from '@/lib/memo'
import type { Prisma } from '@/lib/generated/prisma/client'
import { DEFAULT_SITE, readSite, type SiteContent } from '@/lib/site/rules'

const KEY = 'site'
const cached = memoAsync(15_000, async () => readSite((await db.platformSetting.findUnique({ where: { key: KEY } }))?.value))

/** Public home-page content, remembered 15 seconds. A database problem shows the built-in wording, never a blank page. */
export const getSiteContent = (): Promise<SiteContent> => cached.get().catch(() => DEFAULT_SITE)

export async function saveSiteContent(c: SiteContent) {
  const value = c as unknown as Prisma.InputJsonValue
  await db.platformSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } })
  cached.clear()
}
/** Back to the built-in wording. */
export async function resetSiteContent() {
  await db.platformSetting.deleteMany({ where: { key: KEY } })
  cached.clear()
}
