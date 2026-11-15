import { getCurrentStore } from '@/lib/store'
import { getCheckoutConfig } from '@/lib/data/checkout'
import { isPreviewFor } from '@/lib/preview/server'
import { parseReturnAsk } from '@/lib/returns'
import { requestReturn } from '@/lib/returns-data'
import { normalizeTrackingCode } from '@/lib/tracking-code'
import { clientIp, rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
const json = (status: number, body: object) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const THANKS = { ok: 'Your return request was sent. The shop will answer soon; you can follow it on this page.' }

/**
 * POST /api/returns: a customer asks to return items of a DELIVERED order of THIS shop. The tracking code (and
 * the phone digits, when the shop asks for them) is the proof that the order is theirs. The server decides
 * everything: the window, the items, the quantities. Nothing is refunded here; the owner answers first.
 */
export async function POST(request: Request) {
  if (!rateLimit(`return:${clientIp(request.headers)}`, 5, 3_600_000).ok) return json(429, { error: 'Too many requests. Please try again later.' })
  if (Number(request.headers.get('content-length') ?? 0) > 8000) return json(413, { error: 'That request is too long.' })
  const store = await getCurrentStore()
  if (!store) return json(404, { error: 'This store is not available.' })
  if (!rateLimit(`return-store:${store.id}`, 120, 3_600_000).ok) return json(429, { error: 'Please try again later.' })
  const parsed = parseReturnAsk(await request.json().catch(() => null))
  if (!parsed.ok) return json(400, { error: parsed.error })
  if (parsed.value.website) return json(200, THANKS) // a field people never see: only robots fill it
  if (await isPreviewFor(store.id)) return json(200, THANKS) // the owner trying their own form: nothing is saved
  const code = normalizeTrackingCode(parsed.value.code)
  if (!code) return json(400, { error: 'We could not find a delivered order with those details.' })
  try {
    const config = await getCheckoutConfig(store)
    if (!config.trackingEnabled) return json(403, { error: 'This shop does not take return requests online. Please contact the shop.' })
    const r = await requestReturn(store.id, { ...parsed.value, code }, config.trackingRequiresPhoneLast4)
    return r.ok ? json(200, THANKS) : json(400, { error: r.error })
  } catch (e) {
    console.error('[return]', e instanceof Error ? e.message : e)
    return json(500, { error: 'Could not send your request. Please try again.' })
  }
}
