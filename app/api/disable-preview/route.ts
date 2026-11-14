import { cookies, draftMode } from 'next/headers'
import { redirect } from 'next/navigation'
import { PREVIEW_COOKIE, PREVIEW_THEME_COOKIE, safePreviewPath } from '@/lib/preview/rules'

export const dynamic = 'force-dynamic'

/** "Exit preview": switches draft mode off, removes the pass, and shows the shop exactly as customers see it. */
export async function GET(request: Request) {
  ;(await draftMode()).disable()
  const jar = await cookies()
  jar.delete(PREVIEW_COOKIE); jar.delete(PREVIEW_THEME_COOKIE)
  redirect(safePreviewPath(new URL(request.url).searchParams.get('to')))
}
