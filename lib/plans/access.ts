import { db } from '@/lib/db'
import { storeCached } from '@/lib/cache'
import { readLimits } from '@/lib/signup/plans'
import { lockedMessage, productLimitProblem, resolveFeatures, type FeatureAccess, type ProFeature } from '@/lib/plans/catalog'

/** What is read from the database (plain data, so it can be remembered in the cache). */
interface Raw { status: string | null; planName: string | null; planFeatures: unknown; planLimits: unknown; overrides: unknown; posMode: string | null }

/**
 * Remembered for 30 seconds per store: this is asked on every checkout, order and dashboard page. A change in CSMI
 * (plan, the store's own switches) clears it at once through the audit log; a change to a plan itself shows
 * everywhere within 30 seconds.
 */
const loadRaw = storeCached('plan-access', 30, async (storeId): Promise<Raw> => {
  const s = await db.store.findUnique({ where: { id: storeId }, select: { featureOverrides: true, posMode: true, subscription: { select: { status: true, plan: { select: { name: true, features: true, limits: true } } } } } })
  return { status: s?.subscription?.status ?? null, planName: s?.subscription?.plan.name ?? null, planFeatures: s?.subscription?.plan.features ?? null, planLimits: s?.subscription?.plan.limits ?? null, overrides: s?.featureOverrides ?? null, posMode: s?.posMode ?? null }
})

export interface PlanAccess { features: FeatureAccess; has: (k: ProFeature) => boolean; productLimit: number | null; planName: string | null; trial: boolean }

export async function loadPlanAccess(storeId: string): Promise<PlanAccess> {
  const r = await loadRaw(storeId)
  const features = resolveFeatures({ planFeatures: r.planFeatures, subscriptionStatus: r.status, overrides: r.overrides, posMode: r.posMode })
  // The product limit applies during the trial too: the trial shows the features, the plan sets the size.
  const productLimit = r.status === null ? null : readLimits(r.planLimits).products
  return { features, has: (k) => features.on.has(k), productLimit, planName: r.planName, trial: features.trial }
}

/** One feature, yes or no. The server asks this before doing anything a Pro feature does. Never throws: unsure = no. */
export async function hasFeature(storeId: string, k: ProFeature): Promise<boolean> {
  try { return (await loadPlanAccess(storeId)).has(k) } catch (e) { console.error('[plan access]', e instanceof Error ? e.message : e); return false }
}

/** For server actions: null when allowed, otherwise the refusal to show. */
export async function featureProblem(storeId: string, k: ProFeature): Promise<string | null> {
  return (await hasFeature(storeId, k)) ? null : lockedMessage(k)
}

/** Null when `adding` more products fit in the plan, otherwise the message. Counts every product of the store. */
export async function productRoomProblem(storeId: string, adding: number, tx: Pick<typeof db, 'product'> = db): Promise<string | null> {
  const { productLimit } = await loadPlanAccess(storeId)
  if (productLimit === null) return null
  return productLimitProblem(await tx.product.count({ where: { storeId } }), adding, productLimit)
}
