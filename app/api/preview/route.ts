import { cookies, draftMode } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { previewTarget } from '@/lib/store'
import { PREVIEW_COOKIE, PREVIEW_SESSION_SECONDS, makeSessionPass, readLinkToken, safePreviewPath } from '@/lib/preview/rules'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { PREVIEW_THEME_COOKIE } from '@/lib/preview/rules'

export const dynamic = 'force-dynamic'

const refuse = (status: number, text: string) => new Response(text, { status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } })

/**
 * GET /api/preview?secret=<one-minute token>&slug=<shop page>
 * Opens a preview of THIS shop for the staff member the token was made for.
 */
export async function GET(request: Request) {
  if (!rateLimit(`preview:${clientIp(request.headers)}`, 30, 60_000).ok) return refuse(429, 'Too many tries. Please wait a minute.')
  const { searchParams, protocol } = new URL(request.url)

  // 1. The token: signed by this server, made for one store and one person, at most a minute old.
  const pass = readLinkToken(searchParams.get('secret'))
  // 2. The address: a store's own address only previews that store; a shared address (localhost) lets the token decide.
  const store = pass ? await previewTarget(pass.storeId) : null
  // 3. The person must still be an active member of that store.
  const member = pass && store ? await db.user.count({ where: { id: pass.userId, storeId: pass.storeId, isActive: true } }) : 0
  if (!pass || !store || !member) {
    // The browser gets one answer for every failure (nothing to probe); the reason goes to the server log, without the token.
    console.warn(`[preview] refused: ${!pass ? 'token invalid or older than a minute' : !store ? 'this address belongs to a different store, or the store is not available' : 'the staff member is no longer active'}`)
    return refuse(401, 'This preview link is not valid any more. Open the preview again from your dashboard.')
  }

  // 4. Draft mode: Next.js now builds every page fresh for this browser instead of serving the public copy.
  const draft = await draftMode()
  draft.enable()

  // 5. Cookies that also work inside a frame: SameSite=None needs Secure, which needs https (plain http is only local development).
  const https = protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https'
  const jar = await cookies()
  const bypass = jar.get('__prerender_bypass')
  if (bypass && https) jar.set({ name: bypass.name, value: bypass.value, httpOnly: true, path: '/', sameSite: 'none', secure: true })
  // Our own pass: says WHICH store and WHO. Without it draft mode alone shows nothing extra.
  jar.set({ name: PREVIEW_COOKIE, value: makeSessionPass(pass), httpOnly: true, path: '/', maxAge: PREVIEW_SESSION_SECONDS, sameSite: https ? 'none' : 'lax', secure: https })

  // A draft theme to look at (the shop checks that it belongs to this store before using it); otherwise the live theme.
  const theme = searchParams.get('theme')
  if (theme && /^[A-Za-z0-9_-]{1,40}$/.test(theme)) jar.set({ name: PREVIEW_THEME_COOKIE, value: theme, httpOnly: true, path: '/', maxAge: PREVIEW_SESSION_SECONDS, sameSite: https ? 'none' : 'lax', secure: https })
  else jar.delete(PREVIEW_THEME_COOKIE)

  // 6. On to the page (only ever a page of this same shop).
  redirect(safePreviewPath(searchParams.get('slug')))
}
