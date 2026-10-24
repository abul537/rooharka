/**
 * Parsing and validation of the CSMI forms. Pure (no database), so every rule is unit-tested.
 * Each parser returns clean values or one readable message.
 */
import type { Getter, Parsed } from '@/lib/admin/settings-rules'
import { normalizePkMobile } from '@/lib/phone'
import { validateEmail } from '@/lib/validation'
import { isValidSlug, type BillingInterval, type StoreStatus, type SubStatus } from '@/lib/csmi/rules'

const text = (g: Getter, k: string) => String(g.get(k) ?? '').trim()
const flag = (g: Getter, k: string) => g.get(k) === 'on'

/** Rupees with up to 2 decimals. Empty -> null. Anything else (negative, text, 1e5) -> NaN. */
export function parseMoney(s: string): number | null {
  const v = s.trim().replace(/,/g, '')
  if (v === '') return null
  return /^\d{1,9}(\.\d{1,2})?$/.test(v) ? Number(v) : NaN
}

export const STORE_STATUSES: StoreStatus[] = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED']
export const SUB_STATUSES: SubStatus[] = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED']
export const COST_CATEGORIES = ['hosting', 'database', 'domain', 'messaging', 'support', 'other'] as const
export const PAY_METHODS = ['bank', 'jazzcash', 'easypaisa', 'cash', 'other'] as const

// ------------------------------------------------------------------- plans
export interface PlanInput { name: string; monthlyPrice: number; yearlyPrice: number | null; isActive: boolean }
export function parsePlan(g: Getter): Parsed<PlanInput> {
  const name = text(g, 'name')
  if (name.length < 2 || name.length > 40) return { ok: false, error: 'The plan name must be 2 to 40 characters.' }
  const monthly = parseMoney(text(g, 'monthlyPrice'))
  if (monthly === null || Number.isNaN(monthly)) return { ok: false, error: 'Enter the monthly price in rupees, like 3000.' }
  const yearly = parseMoney(text(g, 'yearlyPrice'))
  if (yearly !== null && (Number.isNaN(yearly) || yearly <= 0)) return { ok: false, error: 'The yearly price must be a number above 0, or left empty.' }
  return { ok: true, value: { name, monthlyPrice: monthly, yearlyPrice: yearly, isActive: flag(g, 'isActive') } }
}

// ------------------------------------------------------------------- costs
export interface CostFormInput { name: string; category: (typeof COST_CATEGORIES)[number]; monthlyAmount: number; storeId: string | null; isActive: boolean; note: string | null }
export function parseCost(g: Getter): Parsed<CostFormInput> {
  const name = text(g, 'name')
  if (name.length < 2 || name.length > 60) return { ok: false, error: 'The cost name must be 2 to 60 characters.' }
  const category = COST_CATEGORIES.find((c) => c === text(g, 'category')) ?? 'other'
  const amount = parseMoney(text(g, 'monthlyAmount'))
  if (amount === null || Number.isNaN(amount) || amount <= 0) return { ok: false, error: 'Enter the monthly cost in rupees, above 0.' }
  if (amount > 10_000_000) return { ok: false, error: 'That monthly cost looks too large. Check the number.' }
  const note = text(g, 'note')
  if (note.length > 200) return { ok: false, error: 'The note must be 200 characters or fewer.' }
  return { ok: true, value: { name, category, monthlyAmount: amount, storeId: text(g, 'storeId') || null, isActive: flag(g, 'isActive'), note: note || null } }
}

// ------------------------------------------------------------------ stores
export interface NewStoreInput { name: string; slug: string; ownerName: string; ownerEmail: string; ownerPhone: string | null; planId: string | null }
export function parseNewStore(g: Getter): Parsed<NewStoreInput> {
  const name = text(g, 'name')
  if (name.length < 2 || name.length > 60) return { ok: false, error: 'The store name must be 2 to 60 characters.' }
  const slug = text(g, 'slug').toLowerCase()
  if (!isValidSlug(slug)) return { ok: false, error: 'The store address must be 3 to 30 characters: lowercase letters, digits and dashes (not at the start or end).' }
  const ownerName = text(g, 'ownerName')
  if (ownerName.length < 2 || ownerName.length > 60) return { ok: false, error: 'Enter the store owner’s name (2 to 60 characters).' }
  const ownerEmail = text(g, 'ownerEmail').toLowerCase()
  if (ownerEmail.length > 120 || validateEmail(ownerEmail)) return { ok: false, error: 'Enter a valid email address for the store owner.' }
  const phoneRaw = text(g, 'ownerPhone')
  const ownerPhone = phoneRaw ? normalizePkMobile(phoneRaw) : null
  if (phoneRaw && !ownerPhone) return { ok: false, error: 'The owner’s phone must be a Pakistani mobile number like 03001234567.' }
  return { ok: true, value: { name, slug, ownerName, ownerEmail, ownerPhone, planId: text(g, 'planId') || null } }
}

export interface StatusInput { status: StoreStatus; reason: string | null }
export function parseStoreStatus(g: Getter): Parsed<StatusInput> {
  const status = STORE_STATUSES.find((s) => s === text(g, 'status'))
  if (!status) return { ok: false, error: 'Choose a status.' }
  const reason = text(g, 'reason')
  if (reason.length > 200) return { ok: false, error: 'The reason must be 200 characters or fewer.' }
  if (status === 'SUSPENDED' && reason.length < 3) return { ok: false, error: 'Write a short reason for suspending (it is saved in the history).' }
  return { ok: true, value: { status, reason: reason || null } }
}

// ------------------------------------------------------------ subscriptions
export interface SubscriptionInput { planId: string; status: SubStatus; interval: BillingInterval; priceOverride: number | null; trialDays: number }
export function parseSubscription(g: Getter): Parsed<SubscriptionInput> {
  const planId = text(g, 'planId')
  if (!planId) return { ok: false, error: 'Choose a plan.' }
  const status = SUB_STATUSES.find((s) => s === text(g, 'status'))
  if (!status) return { ok: false, error: 'Choose a subscription status.' }
  const interval: BillingInterval = text(g, 'interval') === 'YEARLY' ? 'YEARLY' : 'MONTHLY'
  const override = parseMoney(text(g, 'priceOverride'))
  if (override !== null && Number.isNaN(override)) return { ok: false, error: 'The agreed price must be a number in rupees (0 is allowed), or left empty to use the plan price.' }
  const trialRaw = text(g, 'trialDays')
  const trialDays = trialRaw === '' ? 14 : /^\d{1,3}$/.test(trialRaw) ? Number(trialRaw) : NaN
  if (!Number.isInteger(trialDays) || trialDays > 365) return { ok: false, error: 'Trial days must be from 0 to 365.' }
  return { ok: true, value: { planId, status, interval, priceOverride: override, trialDays } }
}

// ----------------------------------------------------------------- services
export function parseServiceFee(g: Getter): Parsed<{ key: string; fee: number }> {
  const key = text(g, 'serviceKey')
  if (!/^[a-z0-9-]{2,40}$/.test(key)) return { ok: false, error: 'Unknown service.' }
  const fee = parseMoney(text(g, 'fee') || '0')
  if (fee === null || Number.isNaN(fee) || fee > 1_000_000) return { ok: false, error: 'The monthly fee must be a number in rupees, from 0 up.' }
  return { ok: true, value: { key, fee } }
}

// ----------------------------------------------------------------- invoices
export function parseMarkPaid(g: Getter): Parsed<{ method: (typeof PAY_METHODS)[number]; reference: string | null }> {
  const method = PAY_METHODS.find((m) => m === text(g, 'method'))
  if (!method) return { ok: false, error: 'Choose how it was paid.' }
  const reference = text(g, 'reference')
  if (reference.length > 60) return { ok: false, error: 'The payment reference must be 60 characters or fewer.' }
  return { ok: true, value: { method, reference: reference || null } }
}
