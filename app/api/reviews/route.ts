import { db } from '@/lib/db'
import { getCurrentStore } from '@/lib/store'
import { isPreviewFor } from '@/lib/preview/server'
import { parseReview } from '@/lib/reviews'
import { clientIp, rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
const json = (status: number, body: object) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const THANKS = { ok: 'Thank you! Your review will appear once the shop has read it.' }

/**
 * POST /api/reviews: a customer's review of one product of THIS shop. It is saved as "waiting": the owner
 * approves it before anyone sees it. With the tracking code of a delivered order that contains the product, the
 * server marks it "verified buyer" (one review per order and product).
 */
export async function POST(request: Request) {
  if (!rateLimit(`review:${clientIp(request.headers)}`, 3, 3_600_000).ok) return json(429, { error: 'You have sent several reviews already. Please try again later.' })
  if (Number(request.headers.get('content-length') ?? 0) > 4000) return json(413, { error: 'That review is too long.' })
  const store = await getCurrentStore()
  if (!store) return json(404, { error: 'This store is not available.' })
  if (!rateLimit(`review-store:${store.id}`, 60, 3_600_000).ok) return json(429, { error: 'Please try again later.' })
  const parsed = parseReview(await request.json().catch(() => null))
  if (!parsed.ok) return parsed.error === 'robot' ? json(200, THANKS) : json(400, { error: parsed.error })
  if (await isPreviewFor(store.id)) return json(200, THANKS) // the owner trying their own form: nothing is saved
  const r = parsed.value
  try {
    const product = await db.product.findFirst({ where: { storeId: store.id, slug: r.productSlug, status: 'ACTIVE' }, select: { id: true } })
    if (!product) return json(404, { error: 'This product is no longer available.' })
    // "Verified buyer": the code must be of a DELIVERED order of this shop that contains this product.
    const order = r.trackingCode ? await db.order.findFirst({ where: { storeId: store.id, trackingCode: r.trackingCode, status: 'DELIVERED', items: { some: { productId: product.id } } }, select: { id: true } }) : null
    if (order && (await db.review.count({ where: { productId: product.id, orderId: order.id } })) > 0) return json(409, { error: 'A review for this order has already been sent. Thank you!' })
    await db.review.create({ data: { productId: product.id, orderId: order?.id ?? null, authorName: r.authorName, city: r.city, rating: r.rating, body: r.body, isApproved: false, isVerified: !!order } })
    return json(200, THANKS)
  } catch (e) {
    console.error('[review]', e instanceof Error ? e.message : e)
    return json(500, { error: 'Could not save your review. Please try again.' })
  }
}
