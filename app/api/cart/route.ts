import { getCurrentStore } from '@/lib/store'
import { getCheckoutConfig, loadCheckoutEntries } from '@/lib/data/checkout'
import { cleanCart } from '@/lib/cart'
import { clientIp, rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
const json = (status: number, body: object) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * POST /api/cart { items: [{ variantId, quantity }] } -> the same lines with today's names, prices and stock.
 * The cart in the browser only remembers WHICH and HOW MANY; everything a customer sees and pays comes from here.
 * Only products of the shop at this address are ever returned.
 */
export async function POST(request: Request) {
  if (!rateLimit(`cart:${clientIp(request.headers)}`, 60, 60_000).ok) return json(429, { error: 'Too many requests. Please wait a moment.' })
  if (Number(request.headers.get('content-length') ?? 0) > 4000) return json(413, { error: 'Request too large.' })
  const store = await getCurrentStore()
  if (!store) return json(404, { error: 'This store is not available.' })
  const body = (await request.json().catch(() => null)) as { items?: unknown } | null
  const items = cleanCart(body?.items)
  if (items.length === 0) return json(200, { currency: store.currency, entries: [], dropped: 0 })
  try {
    const config = await getCheckoutConfig(store)
    const { entries, dropped } = await loadCheckoutEntries(store.id, config.maxQuantity, items)
    return json(200, { currency: config.currency, entries, dropped })
  } catch (e) {
    console.error('[cart]', e instanceof Error ? e.message : e)
    return json(500, { error: 'Could not load your cart. Please try again.' })
  }
}
