import { getCurrentStore } from '@/lib/store'
import { isPreviewFor } from '@/lib/preview/server'
import { isBot } from '@/lib/admin/insights'
import { recordVisit } from '@/lib/visits'
import { clientIp, rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
const done = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

/**
 * POST /api/visit  { view: true | false }
 * The shop pages call this quietly: once per page opened, and once a minute while the page stays open.
 * It always answers "ok" with no content: a visitor must never see an error because counting failed.
 */
export async function POST(request: Request) {
  try {
    const ua = request.headers.get('user-agent')
    const ip = clientIp(request.headers)
    if (isBot(ua) || !rateLimit(`visit:${ip}`, 90, 60_000).ok) return done()
    const store = await getCurrentStore()
    // The owner looking at a preview is not a customer.
    if (!store || (await isPreviewFor(store.id))) return done()
    const body = (await request.json().catch(() => ({}))) as { view?: unknown }
    await recordVisit(store.id, ip, ua!.slice(0, 300), body?.view === true)
  } catch (e) {
    console.error('[visit]', e instanceof Error ? e.message : e)
  }
  return done()
}
