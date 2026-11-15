import { db } from '@/lib/db'
import { getCurrentStore } from '@/lib/store'
import { isPreviewFor } from '@/lib/preview/server'
import { isBot, pktDay } from '@/lib/admin/insights'
import { parseSpeedReport, speedIncrements } from '@/lib/speed'
import { clientIp, rateLimit, storeLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
const done = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

/**
 * POST /api/speed  { path, lcp, ttfb, cls }: one visitor's page-load speed, added to the shop's row for today.
 * Always answers "ok" with no content. Limited per visitor AND per shop, so no shop (or script) can flood the database.
 */
export async function POST(request: Request) {
  try {
    if (isBot(request.headers.get('user-agent')) || Number(request.headers.get('content-length') ?? 0) > 500) return done()
    if (!rateLimit(`speed:${clientIp(request.headers)}`, 30, 60_000).ok) return done()
    const store = await getCurrentStore()
    if (!store || !storeLimit(store.id, 'speed').ok || (await isPreviewFor(store.id))) return done()
    const report = parseSpeedReport(await request.json().catch(() => null))
    if (!report) return done()
    const add = speedIncrements(report), day = pktDay(new Date())
    await db.speedDay.upsert({
      where: { storeId_day_page: { storeId: store.id, day, page: report.page } },
      create: { storeId: store.id, day, page: report.page, ...add },
      update: Object.fromEntries(Object.entries(add).map(([k, v]) => [k, { increment: v }])),
    })
  } catch (e) {
    console.error('[speed]', e instanceof Error ? e.message : e)
  }
  return done()
}
