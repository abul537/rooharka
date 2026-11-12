/**
 * The unit system: one table, no unit hard-coded anywhere else. To support another unit (a "kanal", a "ream"),
 * add ONE line to UNITS. Conversion only ever happens inside one dimension (grams to kilograms, never to litres).
 *
 * Measured products keep their stock and order quantities as WHOLE numbers of the dimension's base unit
 * (grams, millilitres, millimetres), so there are never floating-point stock errors. Prices are "per selling unit"
 * (Rs. 850 per kg); the line total is price x quantity / factor.
 */
export type Dimension = 'COUNT' | 'MASS' | 'VOLUME' | 'LENGTH'

export interface UnitDef {
  code: string
  label: string
  /** Used after a number: "3 boxes". For measured units the symbol is used instead ("1.5 kg"). */
  plural: string
  dimension: Dimension
  /** How many base units one of this unit holds (kg = 1000 g). Counting units are always 1. */
  factor: number
  /** Sensible first values when a store owner picks this as the selling unit (in this unit). */
  defaultStep: number
}

export const BASE_UNIT: Record<Dimension, string> = { COUNT: 'piece', MASS: 'g', VOLUME: 'mL', LENGTH: 'mm' }
export const DIMENSION_LABEL: Record<Dimension, string> = { COUNT: 'Counted (pieces, boxes, bags)', MASS: 'Weight', VOLUME: 'Volume', LENGTH: 'Length' }

const U = (code: string, label: string, plural: string, dimension: Dimension, factor: number, defaultStep: number): UnitDef => ({ code, label, plural, dimension, factor, defaultStep })

export const UNITS: readonly UnitDef[] = [
  // counted: stock is a plain number of these
  U('piece', 'Piece', 'pieces', 'COUNT', 1, 1), U('box', 'Box', 'boxes', 'COUNT', 1, 1), U('bag', 'Bag', 'bags', 'COUNT', 1, 1),
  U('pack', 'Pack', 'packs', 'COUNT', 1, 1), U('bottle', 'Bottle', 'bottles', 'COUNT', 1, 1), U('carton', 'Carton', 'cartons', 'COUNT', 1, 1),
  U('dozen', 'Dozen', 'dozen', 'COUNT', 1, 1), U('pair', 'Pair', 'pairs', 'COUNT', 1, 1), U('set', 'Set', 'sets', 'COUNT', 1, 1),
  // weight (base: gram). tola, seer and maund are the units Pakistani markets still use.
  U('g', 'Gram (g)', 'g', 'MASS', 1, 100), U('kg', 'Kilogram (kg)', 'kg', 'MASS', 1000, 0.25),
  U('tola', 'Tola', 'tola', 'MASS', 11.6638, 1), U('seer', 'Seer', 'seer', 'MASS', 933.1, 0.25), U('maund', 'Maund', 'maund', 'MASS', 37324.2, 0.25),
  // volume (base: millilitre)
  U('mL', 'Millilitre (mL)', 'mL', 'VOLUME', 1, 100), U('L', 'Litre (L)', 'L', 'VOLUME', 1000, 0.5),
  // length (base: millimetre). gaz is the yard used for cloth.
  U('mm', 'Millimetre (mm)', 'mm', 'LENGTH', 1, 10), U('cm', 'Centimetre (cm)', 'cm', 'LENGTH', 10, 10),
  U('m', 'Metre (m)', 'm', 'LENGTH', 1000, 0.5), U('gaz', 'Gaz (yard)', 'gaz', 'LENGTH', 914.4, 0.5),
]

const BY_CODE = new Map(UNITS.map((u) => [u.code, u]))
export const getUnit = (code: string | null | undefined): UnitDef | null => (code ? BY_CODE.get(code) ?? null : null)
export const unitsOf = (d: Dimension) => UNITS.filter((u) => u.dimension === d)
export const COUNT_UNITS = unitsOf('COUNT')
export const MEASURE_UNITS = UNITS.filter((u) => u.dimension !== 'COUNT')
export const isMeasured = (code: string | null | undefined) => { const u = getUnit(code); return !!u && u.dimension !== 'COUNT' }

/** Whole base units for an amount in `code` (1.25 kg -> 1250). Rounds to the nearest base unit. */
export function toBase(value: number, code: string): number {
  const u = getUnit(code)
  if (!u || !Number.isFinite(value)) throw new RangeError(`Unknown unit "${code}"`)
  return Math.round(value * u.factor)
}

/** The amount in `code` for a number of base units (1250 g -> 1.25 kg), rounded to at most 3 decimals. */
export function fromBase(base: number, code: string): number {
  const u = getUnit(code)
  if (!u) throw new RangeError(`Unknown unit "${code}"`)
  return Math.round((base / u.factor) * 1000) / 1000
}

/** Converts between two units of the same dimension; null when they cannot be converted (kg to litres). */
export function convert(value: number, from: string, to: string): number | null {
  const a = getUnit(from), b = getUnit(to)
  if (!a || !b || a.dimension !== b.dimension) return null
  return Math.round(((value * a.factor) / b.factor) * 1e6) / 1e6
}

/** Reads what a person typed ("1.25", "1,5", " 2 ") in the unit `code`: a positive number with at most 3 decimals, or null. */
export function parseAmount(raw: string, code: string): number | null {
  const u = getUnit(code)
  const s = raw.trim().replace(/,/g, '.')
  if (!u || !/^\d{1,7}(\.\d{1,3})?$/.test(s)) return null
  const n = Number(s)
  return n > 0 ? n : null
}

const trim = (n: number) => String(Math.round(n * 1000) / 1000)
// What a customer expects to read: 250 g, not 0.25 kg. Units outside a ladder are shown in their own unit.
const LADDER: Partial<Record<Dimension, [small: string, big: string]>> = { MASS: ['g', 'kg'], VOLUME: ['mL', 'L'], LENGTH: ['cm', 'm'] }

/** A quantity of base units as readable text in the unit people think in: 1500 g -> "1.5 kg", 250 g -> "250 g", 3 boxes -> "3 boxes". */
export function formatQuantity(base: number, code: string | null | undefined): string {
  const u = getUnit(code)
  if (!u || (u.dimension === 'COUNT' && u.code === 'piece')) return String(base)
  if (u.dimension === 'COUNT') return `${base} ${base === 1 ? u.label.toLowerCase() : u.plural}`
  const ladder = LADDER[u.dimension]
  if (ladder && ladder.includes(u.code)) {
    const big = getUnit(ladder[1])!, small = getUnit(ladder[0])!
    return base >= big.factor ? `${trim(base / big.factor)} ${big.code}` : `${trim(base / small.factor)} ${small.code}`
  }
  return `${trim(base / u.factor)} ${u.code}`
}

/** "per kg" / "per box": null for plain pieces (where "per piece" would only be noise). */
export function perUnit(code: string | null | undefined): string | null {
  const u = getUnit(code)
  return !u || (u.dimension === 'COUNT' && u.code === 'piece') ? null : `per ${u.dimension === 'COUNT' ? u.label.toLowerCase() : u.code}`
}
