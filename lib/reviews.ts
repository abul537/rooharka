/**
 * CUSTOMER REVIEWS: the rules (pure). Anyone may write a review; nothing is shown until the store owner approves
 * it. A review that comes with the tracking code of a delivered order containing that product is marked
 * "verified buyer" by the server (the customer cannot claim it themselves).
 */
export interface ReviewInput { productSlug: string; authorName: string; city: string | null; rating: number; body: string; trackingCode: string | null }
export const REVIEW_MIN = 10, REVIEW_MAX = 1000
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

export function parseReview(raw: unknown): { ok: true; value: ReviewInput } | { ok: false; error: string } {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  // A hidden box people never see: only a robot fills it in. The robot is told all went well.
  if (clean(o.website, 100)) return { ok: false, error: 'robot' }
  const productSlug = clean(o.productSlug, 130)
  if (!/^[a-z0-9-]{1,120}$/.test(productSlug)) return { ok: false, error: 'Something went wrong. Please reload the page and try again.' }
  const authorName = clean(o.authorName, 60)
  if (authorName.length < 2 || /https?:|www\.|[<>]/i.test(authorName)) return { ok: false, error: 'Please enter your name.' }
  const rating = typeof o.rating === 'number' && Number.isInteger(o.rating) && o.rating >= 1 && o.rating <= 5 ? o.rating : null
  if (rating === null) return { ok: false, error: 'Please choose a rating from 1 to 5 stars.' }
  const body = clean(o.body, REVIEW_MAX)
  if (body.length < REVIEW_MIN) return { ok: false, error: `Please write at least ${REVIEW_MIN} characters about the product.` }
  if (/https?:\/\/|www\.[a-z]/i.test(body)) return { ok: false, error: 'Reviews cannot contain web addresses.' }
  const city = clean(o.city, 40) || null
  const code = clean(o.trackingCode, 30).toUpperCase()
  return { ok: true, value: { productSlug, authorName, city: city && !/[<>]|https?:/i.test(city) ? city : null, rating, body, trackingCode: /^[A-Z0-9-]{6,24}$/.test(code) ? code : null } }
}
