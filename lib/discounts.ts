/**
 * DISCOUNT CODES: the rules. Pure (no database), shared by the checkout page and the server, so the customer is
 * shown exactly what the server will charge. The server always decides; this file is how it decides.
 */
import type { Cut } from '@/lib/pricing'

export const DISCOUNT_KINDS = ['PERCENT', 'FIXED', 'FREE_DELIVERY'] as const
export type DiscountKind = (typeof DISCOUNT_KINDS)[number]
export const KIND_LABEL: Record<DiscountKind, string> = { PERCENT: 'Percent off', FIXED: 'Rupees off', FREE_DELIVERY: 'Free delivery' }
export const MAX_PERCENT = 90
export const MAX_DISCOUNTS = 200

/** What the rules need to know about a code (the database row, with money as plain numbers). */
export interface DiscountRule { code: string; kind: DiscountKind; value: number; minSubtotal: number; maxUses: number | null; usedCount: number; oncePerCustomer: boolean; startsAt: Date | null; endsAt: Date | null; isActive: boolean }

/** A code as customers type it: letters and digits, 3 to 20, upper-cased ("eid 10" -> "EID10"). null if it cannot be one. */
export function parseDiscountCode(raw: unknown): string | null {
  const c = (typeof raw === 'string' ? raw : '').toUpperCase().replace(/[\s-]/g, '')
  return /^[A-Z0-9]{3,20}$/.test(c) ? c : null
}
const rs = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`

/** Why a code cannot be used on this order right now, in words for the customer; null when it can. */
export function discountProblem(d: DiscountRule, subtotal: number, now = new Date(), usedByThisCustomer = false): string | null {
  if (!d.isActive) return 'That discount code is not valid.'
  if (d.startsAt && now < d.startsAt) return 'That discount code is not active yet.'
  if (d.endsAt && now > d.endsAt) return 'That discount code has expired.'
  if (d.maxUses !== null && d.usedCount >= d.maxUses) return 'That discount code has been used up.'
  if (usedByThisCustomer) return 'You have already used this discount code.'
  if (subtotal < d.minSubtotal) return `This code needs an order of at least ${rs(d.minSubtotal)} (before delivery).`
  return null
}
/** What a code takes off an order of this value. A discount can never exceed the products' value. */
export function discountCut(d: Pick<DiscountRule, 'kind' | 'value'>, subtotal: number): Cut {
  if (d.kind === 'FREE_DELIVERY') return { amount: 0, freeDelivery: true }
  const amount = d.kind === 'PERCENT' ? Math.round((subtotal * Math.min(d.value, MAX_PERCENT)) / 100) : Math.round(d.value)
  return { amount: Math.max(0, Math.min(amount, Math.round(subtotal))), freeDelivery: false }
}
export const describeDiscount = (d: Pick<DiscountRule, 'kind' | 'value'>) => (d.kind === 'PERCENT' ? `${d.value}% off` : d.kind === 'FIXED' ? `${rs(d.value)} off` : 'Free delivery')

export interface DiscountInput { code: string; kind: DiscountKind; value: number; minSubtotal: number; maxUses: number | null; oncePerCustomer: boolean; startsAt: Date | null; endsAt: Date | null; isActive: boolean }
/** The dashboard form, checked. Dates are days in Pakistan time ("2026-11-20"): from the start of the first to the end of the last. */
export function parseDiscountForm(get: (k: string) => unknown): { ok: true; value: DiscountInput } | { ok: false; error: string } {
  const s = (k: string) => String(get(k) ?? '').trim()
  const code = parseDiscountCode(s('code'))
  if (!code) return { ok: false, error: 'The code must be 3 to 20 letters and digits, for example EID10.' }
  const kind = DISCOUNT_KINDS.find((k) => k === s('kind'))
  if (!kind) return { ok: false, error: 'Choose what the code gives.' }
  const num = (k: string) => (/^\d{1,7}$/.test(s(k)) ? Number(s(k)) : s(k) === '' ? 0 : NaN)
  const value = kind === 'FREE_DELIVERY' ? 0 : num('value')
  if (kind === 'PERCENT' && !(value >= 1 && value <= MAX_PERCENT)) return { ok: false, error: `The percentage must be a whole number from 1 to ${MAX_PERCENT}.` }
  if (kind === 'FIXED' && !(value >= 1)) return { ok: false, error: 'Enter how many rupees the code takes off (a whole number).' }
  const minSubtotal = num('minSubtotal')
  if (Number.isNaN(minSubtotal)) return { ok: false, error: 'The minimum order must be a whole number of rupees.' }
  if (kind === 'FIXED' && minSubtotal < value) return { ok: false, error: 'For a rupees-off code, set a minimum order at least as large as the discount, so an order can never be free.' }
  const maxUses = s('maxUses') === '' ? null : num('maxUses')
  if (maxUses !== null && !(maxUses >= 1)) return { ok: false, error: 'The number of uses must be a whole number, or empty for no limit.' }
  const day = (k: string, end: boolean) => { const v = s(k); if (!v) return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined; const d = new Date(`${v}T${end ? '23:59:59' : '00:00:00'}+05:00`); return Number.isNaN(d.getTime()) ? undefined : d }
  const startsAt = day('startsAt', false), endsAt = day('endsAt', true)
  if (startsAt === undefined || endsAt === undefined) return { ok: false, error: 'Enter the dates as a day, or leave them empty.' }
  if (startsAt && endsAt && endsAt < startsAt) return { ok: false, error: 'The last day cannot be before the first day.' }
  return { ok: true, value: { code, kind, value, minSubtotal, maxUses, oncePerCustomer: get('oncePerCustomer') === 'on', startsAt, endsAt, isActive: get('isActive') === 'on' } }
}
