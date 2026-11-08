import { db } from '@/lib/db'
import { CsmiError } from '@/lib/csmi/manage'
import { clearBannerCache } from '@/lib/banners/store'
import type { BannerInput } from '@/lib/banners/rules'

export async function saveBanner(id: string | null, input: BannerInput): Promise<string> {
  let saved = id
  if (id) {
    const r = await db.banner.updateMany({ where: { id }, data: input })
    if (r.count === 0) throw new CsmiError('Banner not found.')
  } else {
    saved = (await db.banner.create({ data: input, select: { id: true } })).id
  }
  clearBannerCache()
  return saved as string
}

export async function deleteBanner(id: string) {
  const r = await db.banner.deleteMany({ where: { id } })
  if (r.count === 0) throw new CsmiError('Banner not found.')
  clearBannerCache()
}
