import { getCurrentStore } from '@/lib/store'
import { describeDiscount, discountProblem, parseDiscountCode } from '@/lib/discounts'
import { findDiscount } from '@/lib/discounts-data'
import { clientIp, rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
const json = (status: number, body: object) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * POST /api/discount { code, subtotal } -> what the code gives, so the checkout can show it before the order is
 * placed. This is only a preview: the order itself checks the code again with the real prices.
 * Limited to 10 tries a minute per visitor, and every wrong code gets the same answer, so codes cannot be guessed.
 */
export async function POST(request: Request) {
  if (!rateLimit(`discount:${clientIp(request.headers)}`, 10, 60_000).ok) return json(429, { error: 'Too many tries. Please wait a minute.' })
  const store = await getCurrentStore()
  if (!store) return json(404, { error: 'This store is not available.' })
  const body = (await request.json().catch(() => null)) as { code?: unknown; subtotal?: unknown } | null
  const code = parseDiscountCode(body?.code)
  const subtotal = typeof body?.subtotal === 'number' && Number.isFinite(body.subtotal) && body.subtotal >= 0 ? body.subtotal : 0
  try {
    const d = code ? await findDiscount(store.id, code) : null
    if (!d) return json(404, { error: 'That discount code is not valid.' })
    const problem = discountProblem(d, subtotal)
    if (problem) return json(409, { error: problem })
    return json(200, { code: d.code, kind: d.kind, value: d.value, minSubtotal: d.minSubtotal, text: describeDiscount(d) })
  } catch (e) {
    console.error('[discount]', e instanceof Error ? e.message : e)
    return json(500, { error: 'Could not check the code. Please try again.' })
  }
}
