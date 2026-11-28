import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { shopOriginFor } from '@/lib/shop-address'
import { makeLinkToken, previewLink, safePreviewPath } from '@/lib/preview/rules'

export const dynamic = 'force-dynamic'

/**
 * The Preview button points here. Only a signed-in member of the store reaches this line; the one-minute token
 * is made NOW (at the click), for this store and this person, and the browser is sent to the shop with it.
 * Making it at the click means a dashboard page left open for an hour still gives a working Preview button.
 */
export async function GET(request: Request) {
  const admin = await requireAdmin() // not signed in -> login page
  const params = new URL(request.url).searchParams
  const path = safePreviewPath(params.get('path'))
  const host = (await headers()).get('host')
  // The shop's own address (never the public site's): there the one-minute token is exchanged for the preview pass.
  const origin = await shopOriginFor(admin.storeId, host, true)
  if (!origin) {
    return new Response('Your shop does not have a web address yet, so there is nothing to preview. Connect a domain in Settings, or ask the platform team for your shop address.', { status: 409, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } })
  }
  await audit({ storeId: admin.storeId, userId: admin.id, action: 'store.preview', entity: 'Store', entityId: admin.storeId, after: { path } })
  redirect(previewLink(origin, path, makeLinkToken({ storeId: admin.storeId, userId: admin.id }), params.get('theme')))
}
