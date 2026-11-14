import { cache } from 'react'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { isPreviewFor } from '@/lib/preview/server'
import { PREVIEW_THEME_COOKIE } from '@/lib/preview/rules'
import { getLiveTheme, getThemeById } from '@/lib/theme/data'
import type { Template } from '@/lib/theme/schema'
import type { ThemeSettings } from '@/lib/theme/settings'
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

/**
 * Content plus the theme to draw with. Customers always get the LIVE theme. The owner, inside a preview, may be
 * looking at one of their own draft themes instead (it is loaded fresh, limited to this store, and never cached).
 * Worked out once per request.
 */
export const getShopContext = cache(async (store: { id: string; name: string }): Promise<ShopContext & { theme: ThemeSettings; home: Template; draftTheme: boolean }> => {
  const base = await load(`${store.id}|${store.name}`)
  if (await isPreviewFor(store.id)) {
    const wanted = (await cookies()).get(PREVIEW_THEME_COOKIE)?.value
    const draft = wanted ? await getThemeById(store.id, wanted, base.content) : null
    if (draft) return { ...base, theme: draft.settings, home: draft.home, draftTheme: true }
  }
  const live = await getLiveTheme(store.id, base.content)
  return { ...base, theme: live.settings, home: live.home, draftTheme: false }
})

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
