import type { Metadata } from 'next'
import Link from 'next/link'
import ShopHeader from '@/components/shop/ShopHeader'
import ShopFooter from '@/components/shop/ShopFooter'
import { db } from '@/lib/db'
import { getCurrentStore, getShopClosure, getStoreForHost } from '@/lib/store'
import { isPreviewFor } from '@/lib/preview/server'
import PreviewBanner from '@/components/shop/PreviewBanner'
import VisitBeacon from '@/components/shop/VisitBeacon'
import { getShopContext } from '@/lib/storefront/data'
import { safeUrl } from '@/lib/storefront/rules'
import { themeStyle } from '@/lib/storefront/theme'

/** Title, description and icon come from the store's own Settings; nothing is shared between stores. */
export async function generateMetadata(): Promise<Metadata> {
  const store = await getCurrentStore()
  if (!store) return { title: 'Store' }
  const s = await db.storeSettings.findUnique({ where: { storeId: store.id }, select: { seoTitle: true, seoDescription: true, faviconUrl: true } }).catch(() => null)
  return {
    // A preview is private to the owner: tell search engines to keep out, in case a preview address is ever shared.
    ...((await isPreviewFor(store.id)) ? { robots: { index: false, follow: false } } : {}),
    title: { default: s?.seoTitle || store.name, template: `%s | ${store.name}` },
    description: s?.seoDescription ?? undefined,
    icons: s?.faviconUrl && safeUrl(s.faviconUrl, false) ? { icon: s.faviconUrl } : undefined,
  }
}

// Storefront shell. A shop the platform owner has not approved shows a plain notice instead of any page
// (the owner's reason is for the store owner only, never shown to customers).
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const [store, closed] = await Promise.all([getCurrentStore(), getShopClosure()])
  if (closed || !store) {
    const waiting = closed?.approval === 'PENDING'
    return (
      <main className="grid min-h-screen place-items-center px-6 py-16 text-center">
        <div className="max-w-md">
          <h1 className="text-2xl font-semibold">{closed?.name ?? 'Store'}</h1>
          <p className="mt-3 text-stone-600">{waiting ? 'This shop is not open yet. Please check back soon.' : 'This shop is not available right now.'}</p>
        </div>
      </main>
    )
  }
  const [ctx, preview, raw] = await Promise.all([getShopContext(store), isPreviewFor(store.id), getStoreForHost()])
  const { announcement, color, font } = ctx.content
  return (
    <div style={themeStyle(color, font)} className="flex min-h-screen flex-col bg-white text-gray-900">
      {announcement.text && (
        <p className="bg-brand-700 px-4 py-2 text-center text-sm text-white">
          {announcement.text}
          {announcement.link && (announcement.link.startsWith('/') ? <Link href={announcement.link} className="ml-2 font-semibold underline">Learn more</Link> : <a href={announcement.link} target="_blank" rel="noopener noreferrer" className="ml-2 font-semibold underline">Learn more</a>)}
        </p>
      )}
      <ShopHeader name={store.name} ctx={ctx} />
      <main className="flex-1">{children}</main>
      <ShopFooter name={store.name} ctx={ctx} />
      {preview ? <PreviewBanner closed={raw?.approval !== 'APPROVED'} /> : <VisitBeacon />}
    </div>
  )
}
