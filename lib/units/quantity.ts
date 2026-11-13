/**
 * How much of a product can be bought, and what it costs. Pure: shared by the storefront, checkout, POS and the
 * server (which re-checks everything; the browser is never trusted).
 */
import { getUnit, isMeasured } from '@/lib/units/registry'

/** Largest order quantity accepted at all (base units): 10,000 kg of rice is already a lorry. */
export const MAX_BASE_QUANTITY = 10_000_000

export type ProductKind = 'SIMPLE' | 'VARIANTS' | 'MEASURABLE'
export const PRODUCT_KINDS: readonly ProductKind[] = ['SIMPLE', 'VARIANTS', 'MEASURABLE']

export interface QuantityRule {
  /** Selling unit code (kg, box, ...) or null for plain pieces. */
  unit: string | null
  measured: boolean
  min: number
  step: number
  /** Most the customer may take now (stock, store cap); null = no limit besides MAX_BASE_QUANTITY. */
  max: number | null
}

export interface RuleInput { type: string; unitCode: string | null; qtyMin: number | null; qtyStep: number | null }

/** The buying rule for one product. `stock` is null when stock is not tracked; `storeMax` is the store's "most per order" for counted items. */
export function quantityRule(p: RuleInput, stock: number | null, storeMax: number): QuantityRule {
  const measured = p.type === 'MEASURABLE' && isMeasured(p.unitCode)
  if (!measured) return { unit: p.unitCode, measured: false, min: 1, step: 1, max: stock === null ? storeMax : Math.min(storeMax, stock) }
  const step = Math.max(1, p.qtyStep ?? 1)
  return { unit: p.unitCode, measured: true, min: Math.max(step, p.qtyMin ?? step), step, max: stock === null ? MAX_BASE_QUANTITY : Math.min(MAX_BASE_QUANTITY, stock) }
}

/** The biggest allowed quantity: the limit, rounded down to a whole step. */
function top(rule: QuantityRule): number {
  const max = rule.max ?? MAX_BASE_QUANTITY
  return rule.min + Math.floor((max - rule.min) / rule.step) * rule.step
}

/** Is there anything the customer can buy right now? (false when the stock is below the minimum order) */
export const isBuyable = (rule: QuantityRule) => (rule.max ?? Infinity) >= rule.min

/** Brings any number into the allowed set: at least the minimum, a whole number of steps above it, at most the limit. */
export function snapQuantity(rule: QuantityRule, q: number): number {
  if (!Number.isFinite(q)) return rule.min
  const t = top(rule)
  if (t < rule.min) return rule.min
  const stepped = rule.min + Math.round((Math.min(Math.max(q, rule.min), t) - rule.min) / rule.step) * rule.step
  return Math.min(stepped, t)
}

export const stepQuantity = (rule: QuantityRule, q: number, dir: 1 | -1) => snapQuantity(rule, q + dir * rule.step)

/** Why a quantity is not allowed, or null. Used by the server on every order and sale. */
export function quantityProblem(rule: QuantityRule, q: number, name = 'this item'): string | null {
  if (!Number.isInteger(q) || q < 1 || q > MAX_BASE_QUANTITY) return 'Invalid quantity.'
  if (!rule.measured) return rule.max !== null && q > rule.max ? `You can order at most ${rule.max} of ${name} at a time.` : null
  const u = getUnit(rule.unit)
  const fmt = (n: number) => `${Math.round((n / (u?.factor ?? 1)) * 1000) / 1000} ${u?.code ?? ''}`.trim()
  if (q < rule.min) return `The smallest order of ${name} is ${fmt(rule.min)}.`
  if ((q - rule.min) % rule.step !== 0) return `${name} is sold in steps of ${fmt(rule.step)}.`
  return null
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Money for a quantity. Measured: price is per selling unit (Rs. 850 per kg), quantity is in base units, and the line is
 * rounded to a whole rupee like every other amount a customer pays. Counted: price x quantity.
 */
export function lineTotal(unitPrice: number, quantity: number, unitCode: string | null | undefined): number {
  const u = getUnit(unitCode)
  return u && u.dimension !== 'COUNT' ? Math.round((unitPrice * quantity) / u.factor) : round2(unitPrice * quantity)
}

/**
 * Does the stock number LIMIT what can be bought? Not when stock is not tracked, and not when the owner ticked
 * "continue selling when out of stock" (then the stock is still counted down, and may go below zero).
 */
export const stockLimited = (v: { trackStock: boolean; allowBackorder?: boolean | null }) => v.trackStock && !v.allowBackorder
