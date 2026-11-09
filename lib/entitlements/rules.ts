/**
 * What a store is ALLOWED to use, decided by the platform owner (CSMI). Pure rules, no database, so every
 * decision is unit-tested. The owner decides at two levels:
 *   1. the PLAN (staff limit, "POS lite" ticked or not), and
 *   2. the individual STORE, which can override the plan either way.
 * The store's own staff can never change any of this.
 */
import { readLimits } from '@/lib/signup/plans'

/** A store with no plan yet (should not happen) still gets a small, safe limit instead of "unlimited". */
export const DEFAULT_STAFF_LIMIT = 2
/** Stored in `Store.staffLimit` to mean "no limit for this store" (null means "follow the plan"). */
export const STAFF_UNLIMITED = -1
export const MAX_STAFF_LIMIT = 500

export type PosMode = 'PLAN' | 'ON' | 'OFF'
export const POS_MODES: PosMode[] = ['PLAN', 'ON', 'OFF']
export const POS_FEATURE = 'pos'

export type LimitSource = 'store' | 'plan' | 'default'
export interface StaffLimit { limit: number | null; source: LimitSource } // null = unlimited

/**
 * How many staff logins (managers and staff; the owner is always free) a store may have.
 * Order: the store's own override, then the plan, then the safe default.
 */
export function effectiveStaffLimit(input: { storeLimit: number | null; plan: { limits: unknown } | null }): StaffLimit {
  if (input.storeLimit === STAFF_UNLIMITED) return { limit: null, source: 'store' }
  if (typeof input.storeLimit === 'number' && input.storeLimit >= 0) return { limit: input.storeLimit, source: 'store' }
  if (!input.plan) return { limit: DEFAULT_STAFF_LIMIT, source: 'default' }
  return { limit: readLimits(input.plan.limits).staff, source: 'plan' } // an empty plan limit is the owner's choice: unlimited
}

/** The message shown when a store wants one more staff login than it may have, or null when there is room. */
export function staffSlotProblem(used: number, limit: StaffLimit): string | null {
  if (limit.limit === null || used < limit.limit) return null
  if (limit.limit === 0) return 'Your plan does not include staff logins. Contact the platform owner to add some.'
  return `Your plan allows ${limit.limit} staff login${limit.limit === 1 ? '' : 's'} and all are in use. Switch one off, or contact the platform owner to raise the limit.`
}

/** "3 of 5 staff logins used", for the Team page and the CSMI store page. */
export function staffUsage(used: number, limit: StaffLimit): string {
  return limit.limit === null ? `${used} staff login${used === 1 ? '' : 's'} (no limit)` : `${used} of ${limit.limit} staff login${limit.limit === 1 ? '' : 's'} used`
}

export const isOverStaffLimit = (used: number, limit: StaffLimit) => limit.limit !== null && used > limit.limit

export interface PosAccess { enabled: boolean; source: 'store' | 'plan' }

/** Does this store get the POS? A store switch ON/OFF wins; otherwise the plan decides. */
export function posAccess(input: { mode: string; planFeatures: unknown }): PosAccess {
  if (input.mode === 'ON') return { enabled: true, source: 'store' }
  if (input.mode === 'OFF') return { enabled: false, source: 'store' }
  const f = Array.isArray(input.planFeatures) ? input.planFeatures : []
  return { enabled: f.includes(POS_FEATURE), source: 'plan' }
}

/** Reads the CSMI "staff limit for this store" field: empty = follow the plan, "unlimited", or a whole number. */
export function parseStoreStaffLimit(raw: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const v = raw.trim().toLowerCase()
  if (v === '') return { ok: true, value: null }
  if (v === 'unlimited') return { ok: true, value: STAFF_UNLIMITED }
  if (!/^\d{1,3}$/.test(v) || Number(v) > MAX_STAFF_LIMIT) return { ok: false, error: `The staff limit must be a whole number from 0 to ${MAX_STAFF_LIMIT}, “unlimited”, or empty to follow the plan.` }
  return { ok: true, value: Number(v) }
}

export function parsePosMode(raw: string): PosMode | null {
  return POS_MODES.find((m) => m === raw) ?? null
}
