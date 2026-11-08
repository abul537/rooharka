import { db } from '@/lib/db'
import { memoAsync } from '@/lib/memo'
import { pickBanners, type BannerRow } from '@/lib/banners/rules'

const cached = memoAsync(15_000, (): Promise<BannerRow[]> => db.banner.findMany({ where: { isActive: true }, orderBy: { createdAt: 'desc' }, take: 50 }))

/** Notices to show right now for one audience. Remembered 15 seconds; a database problem shows no banner, never an error page. */
export async function getBanners(who: 'PUBLIC' | 'STORES'): Promise<BannerRow[]> {
  try { return pickBanners(await cached.get(), who) } catch { return [] }
}
/** Called after CSMI saves a banner so this server shows the change at once. */
export const clearBannerCache = () => cached.clear()
