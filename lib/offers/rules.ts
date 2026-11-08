import type { Getter, Parsed } from '@/lib/admin/settings-rules'
import type { InvoiceLine } from '@/lib/csmi/rules'

/**
 * Promotion rules as pure functions (no database), so every case is unit-tested.
 * An offer = a code worth `percentOff` of the PLAN fee for the first `periods` invoices.
 */
const round2 = (n: number) => Math.round(n * 100) / 100

/** Upper-case letters, digits and dashes only; people type codes in any case with stray spaces. */
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24)
export const validCode = (c: string) => /^[A-Z0-9][A-Z0-9-]{2,23}$/.test(c)

export interface OfferRow {
  code: string; title: string; percentOff: number; periods: number; planId: string | null
  startsAt: Date | null; endsAt: Date | null; maxUses: number | null; usedCount: number; isActive: boolean
}

/** Why a code cannot be used right now (a sentence safe to show), or null when it can. */
export function offerProblem(o: OfferRow | null, ctx: { planId: string; now?: Date }): string | null {
  const now = ctx.now ?? new Date()
  if (!o || !o.isActive) return 'That offer code is not valid.'
  if (o.startsAt && o.startsAt > now) return 'That offer has not started yet.'
  if (o.endsAt && o.endsAt < now) return 'That offer has ended.'
  if (o.planId && o.planId !== ctx.planId) return 'That offer is not valid for the plan you chose.'
  if (o.maxUses !== null && o.usedCount >= o.maxUses) return 'That offer has been fully claimed.'
  return null
}

/** "20% off the plan fee for the first 3 months": the sentence shown next to the code. */
export function describeOffer(o: Pick<OfferRow, 'percentOff' | 'periods'>, interval: 'MONTHLY' | 'YEARLY' = 'MONTHLY'): string {
  const unit = interval === 'YEARLY' ? 'year' : 'month'
  const what = o.percentOff >= 100 ? 'Free plan' : `${o.percentOff}% off the plan fee`
  return o.periods === 1 ? `${what} for the first ${unit}` : `${what} for the first ${o.periods} ${unit}s`
}

/**
 * Adds ONE negative line for the discount, worked out on the plan fee (the first line) only.
 * Returns the lines unchanged when there is nothing to discount.
 */
export function applyDiscount(lines: InvoiceLine[], percent: number, label: string): InvoiceLine[] {
  const pct = Math.min(100, Math.max(0, Math.floor(percent)))
  if (pct === 0 || lines.length === 0 || lines[0].amount <= 0) return lines
  return [...lines, { label: `${label} (${pct}% off)`, amount: -round2((lines[0].amount * pct) / 100) }]
}

// ---------------------------------------------------------------- the CSMI form
export interface OfferInput {
  code: string; title: string; percentOff: number; periods: number; planId: string | null
  startsAt: Date | null; endsAt: Date | null; maxUses: number | null; isActive: boolean
}
const text = (g: Getter, k: string) => String(g.get(k) ?? '').trim()
const int = (s: string) => (/^\d{1,6}$/.test(s) ? Number(s) : null)
/** yyyy-mm-dd from a date input, read as Pakistan time (start of that day, or end of day for `end`). */
function day(s: string, end: boolean): Date | null | undefined {
  if (!s) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined
  const d = new Date(`${s}T${end ? '23:59:59' : '00:00:00'}+05:00`)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export function parseOffer(g: Getter): Parsed<OfferInput> {
  const code = normalizeCode(text(g, 'code'))
  if (!validCode(code)) return { ok: false, error: 'The code must be 3 to 24 letters, digits or dashes, like LAUNCH20.' }
  const title = text(g, 'title')
  if (title.length < 3 || title.length > 80) return { ok: false, error: 'The title must be 3 to 80 characters.' }
  const percentOff = int(text(g, 'percentOff'))
  if (percentOff === null || percentOff < 1 || percentOff > 100) return { ok: false, error: 'Percent off must be a whole number from 1 to 100.' }
  const periods = int(text(g, 'periods'))
  if (periods === null || periods < 1 || periods > 36) return { ok: false, error: 'The discount must last 1 to 36 billing periods.' }
  const startsAt = day(text(g, 'startsAt'), false), endsAt = day(text(g, 'endsAt'), true)
  if (startsAt === undefined || endsAt === undefined) return { ok: false, error: 'Dates must be real dates.' }
  if (startsAt && endsAt && endsAt < startsAt) return { ok: false, error: 'The end date must be after the start date.' }
  const maxRaw = text(g, 'maxUses')
  const maxUses = maxRaw === '' ? null : int(maxRaw)
  if (maxRaw !== '' && (maxUses === null || maxUses < 1)) return { ok: false, error: 'Maximum uses must be a whole number above 0, or empty for unlimited.' }
  return { ok: true, value: { code, title, percentOff, periods, planId: text(g, 'planId') || null, startsAt, endsAt, maxUses, isActive: g.get('isActive') === 'on' } }
}
