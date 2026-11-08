import { db } from '@/lib/db'
import { memoAsync } from '@/lib/memo'
import type { PublicPlan } from '@/components/platform/PlanCards'

const cached = memoAsync(30_000, async (): Promise<PublicPlan[]> => {
  const rows = await db.plan.findMany({ where: { isActive: true, isPublic: true }, orderBy: [{ sortOrder: 'asc' }, { monthlyPrice: 'asc' }], select: { id: true, name: true, monthlyPrice: true, yearlyPrice: true, limits: true, features: true } })
  return rows.map((p) => ({ id: p.id, name: p.name, monthly: p.monthlyPrice.toNumber(), yearly: p.yearlyPrice ? p.yearlyPrice.toNumber() : null, limits: p.limits, features: p.features }))
})
/** Plans offered right now, remembered for 30 seconds. A database problem shows "no plans yet" instead of an error page. */
export const getPublicPlans = (): Promise<PublicPlan[]> => cached.get().catch(() => [])
