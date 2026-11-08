import { db } from '@/lib/db'
import { memoKeyed } from '@/lib/memo'

export interface HomeReview { id: string; authorName: string; city: string | null; rating: number; body: string; isVerified: boolean; product: string }
export interface HomeReviews { items: HomeReview[]; average: number | null; count: number }

/** Real, approved customer reviews only (the owner approves each one). Never invented or hard-coded. Remembered 60 s. */
export const getHomeReviews = memoKeyed(60_000, async (storeId: string): Promise<HomeReviews> => {
  const where = { isApproved: true, product: { storeId, status: 'ACTIVE' as const } }
  const [rows, agg] = await Promise.all([
    db.review.findMany({ where: { ...where, rating: { gte: 4 } }, orderBy: [{ isVerified: 'desc' }, { createdAt: 'desc' }], take: 3, select: { id: true, authorName: true, city: true, rating: true, body: true, isVerified: true, product: { select: { name: true } } } }),
    db.review.aggregate({ where, _avg: { rating: true }, _count: { _all: true } }),
  ])
  return {
    items: rows.map((r) => ({ id: r.id, authorName: r.authorName, city: r.city, rating: r.rating, body: r.body.slice(0, 280), isVerified: r.isVerified, product: r.product.name })),
    average: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : null,
    count: agg._count._all,
  }
})
