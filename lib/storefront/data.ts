import { db } from '@/lib/db'
import { memoKeyed } from '@/lib/memo'
import { readStorefront, type StorefrontContent } from '@/lib/storefront/rules'

/** What every storefront page needs to draw itself: the owner's content plus the store's contact and branding settings. */
export interface ShopContext {
  content: StorefrontContent
  logoUrl: string | null
  phone: string | null; whatsapp: string | null; email: string | null
  trackingEnabled: boolean
}

/** One light query pair per 15 seconds per store; dashboard edits show on the shop within that time. */
const load = memoKeyed(15_000, async (key: string): Promise<ShopContext> => {
  const [storeId, name] = [key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|') + 1)]
  const [row, s] = await Promise.all([
    db.storefront.findUnique({ where: { storeId }, select: { content: true } }),
    db.storeSettings.findUnique({ where: { storeId }, select: { logoUrl: true, supportPhone: true, supportWhatsapp: true, supportEmail: true, orderTrackingEnabled: true } }),
  ])
  return {
    content: readStorefront(row?.content, name),
    logoUrl: s?.logoUrl ?? null, phone: s?.supportPhone ?? null, whatsapp: s?.supportWhatsapp ?? null, email: s?.supportEmail ?? null,
    trackingEnabled: s?.orderTrackingEnabled ?? true,
  }
})

export const getShopContext = (store: { id: string; name: string }) => load(`${store.id}|${store.name}`)

/** Uncached, for the dashboard editor (always shows what is really saved). */
export async function loadStorefrontForEdit(storeId: string, name: string) {
  const [row, s] = await Promise.all([
    db.storefront.findUnique({ where: { storeId }, select: { content: true } }),
    db.storeSettings.findUnique({ where: { storeId }, select: { logoUrl: true, faviconUrl: true, seoTitle: true, seoDescription: true } }),
  ])
  return { content: readStorefront(row?.content, name), logoUrl: s?.logoUrl ?? '', seo: { faviconUrl: s?.faviconUrl ?? '', seoTitle: s?.seoTitle ?? '', seoDescription: s?.seoDescription ?? '' } }
}

export async function saveStorefront(storeId: string, content: StorefrontContent) {
  const value = content as unknown as import('@/lib/generated/prisma/client').Prisma.InputJsonValue
  await db.storefront.upsert({ where: { storeId }, create: { storeId, content: value }, update: { content: value } })
}
