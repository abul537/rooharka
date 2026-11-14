import { db } from '@/lib/db'
import { getCurrentStore } from '@/lib/store'
import { isPreviewFor } from '@/lib/preview/server'
import { parseSubscriberEmail } from '@/lib/theme/newsletter'
import { clientIp, rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
const json = (status: number, body: object) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * POST /api/newsletter { email }: a customer asks to hear from this shop.
 * The answer is the same whether the address is new or already on the list, so the list cannot be probed.
 */
export async function POST(request: Request) {
  if (!rateLimit(`newsletter:${clientIp(request.headers)}`, 5, 60_000).ok) return json(429, { error: 'Too many tries. Please wait a minute.' })
  const store = await getCurrentStore()
  if (!store) return json(404, { error: 'This store is not available.' })
  const body = (await request.json().catch(() => ({}))) as { email?: unknown }
  const email = parseSubscriberEmail(body?.email)
  if (!email) return json(400, { error: 'Please enter a valid email address.' })
  if (await isPreviewFor(store.id)) return json(200, { ok: true }) // the owner trying their own form: nothing is saved
  try {
    await db.newsletterSubscriber.upsert({ where: { storeId_email: { storeId: store.id, email } }, create: { storeId: store.id, email }, update: {} })
  } catch (e) {
    console.error('[newsletter]', e instanceof Error ? e.message : e)
    return json(500, { error: 'Could not save. Please try again.' })
  }
  return json(200, { ok: true })
}
