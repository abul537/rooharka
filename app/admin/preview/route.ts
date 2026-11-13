import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { storeAddress } from '@/lib/platform-host'
import { makeLinkToken, previewLink, safePreviewPath, storeOrigin } from '@/lib/preview/rules'

export const dynamic = 'force-dynamic'

/**
 * The Preview button points here. Only a signed-in member of the store reaches this line; the one-minute token
 * is made NOW (at the click), for this store and this person, and the browser is sent to the shop with it.
 * Making it at the click means a dashboard page left open for an hour still gives a working Preview button.
 */
export async function GET(request: Request) {
  const admin = await requireAdmin() // not signed in -> login page
  const path = safePreviewPath(new URL(request.url).searchParams.get('path'))
  const [store, host] = await Promise.all([
    db.store.findUnique({ where: { id: admin.storeId }, select: { slug: true, domains: { where: { verifiedAt: { not: null } }, select: { host: true, isPrimary: true } } } }),
    headers().then((h) => h.get('host')),
  ])
  if (!store) redirect('/admin')
  const origin = storeOrigin({ domains: store.domains, free: storeAddress(store.slug), requestHost: host })
  await audit({ storeId: admin.storeId, userId: admin.id, action: 'store.preview', entity: 'Store', entityId: admin.storeId, after: { path } })
  redirect(previewLink(origin, path, makeLinkToken({ storeId: admin.storeId, userId: admin.id })))
}
