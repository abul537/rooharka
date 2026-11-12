/**
 * Products with variants: the owner lists the options (Size: S, M, L / Colour: Red, Blue) and the system builds
 * every combination. Pure rules, unit-tested. Existing variants keep their price, stock and history: generating
 * again only ADDS the missing combinations and SWITCHES OFF the ones that no longer exist (never deletes).
 */
export interface OptionGroup { name: string; values: string[] }
export type OptionValues = Record<string, string>

export const MAX_GROUPS = 3
export const MAX_VALUES = 30
export const MAX_COMBINATIONS = 100

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** Reads the owner's text, one option per line: "Size: S, M, L". An empty text means "no options". */
export function parseOptionGroups(raw: string): { ok: true; value: OptionGroup[] } | { ok: false; error: string } {
  const lines = raw.split(/\r?\n/).map(clean).filter(Boolean)
  if (lines.length > MAX_GROUPS) return { ok: false, error: `Use at most ${MAX_GROUPS} options (for example Size, Colour, Material).` }
  const groups: OptionGroup[] = []
  for (const line of lines) {
    const i = line.indexOf(':')
    if (i < 1) return { ok: false, error: `“${line.slice(0, 30)}”: write it like  Size: S, M, L` }
    const name = clean(line.slice(0, i))
    if (name.length > 20) return { ok: false, error: `The option name “${name.slice(0, 20)}…” must be 20 characters or fewer.` }
    if (groups.some((g) => same(g.name, name))) return { ok: false, error: `The option “${name}” is listed twice.` }
    const values: string[] = []
    for (const v of line.slice(i + 1).split(',').map(clean).filter(Boolean)) {
      if (v.length > 30) return { ok: false, error: `${name}: “${v.slice(0, 20)}…” must be 30 characters or fewer.` }
      if (!values.some((x) => same(x, v))) values.push(v)
    }
    if (values.length === 0) return { ok: false, error: `${name} needs at least one value, like  ${name}: Small, Large` }
    if (values.length > MAX_VALUES) return { ok: false, error: `${name} can have at most ${MAX_VALUES} values.` }
    groups.push({ name, values })
  }
  const total = groups.reduce((n, g) => n * g.values.length, groups.length ? 1 : 0)
  if (total > MAX_COMBINATIONS) return { ok: false, error: `These options make ${total} variants; the most is ${MAX_COMBINATIONS}. Remove some values.` }
  return { ok: true, value: groups }
}

export const optionGroupsToText = (groups: OptionGroup[]) => groups.map((g) => `${g.name}: ${g.values.join(', ')}`).join('\n')

/** Reads stored JSON defensively (it is only ever written by this module, but never trust the database blindly). */
export function readOptionGroups(json: unknown): OptionGroup[] {
  if (!Array.isArray(json)) return []
  const out: OptionGroup[] = []
  for (const g of json.slice(0, MAX_GROUPS)) {
    const name = typeof g?.name === 'string' ? g.name : ''
    const values = Array.isArray(g?.values) ? g.values.filter((v: unknown): v is string => typeof v === 'string').slice(0, MAX_VALUES) : []
    if (name && values.length) out.push({ name, values })
  }
  return out
}
export function readOptionValues(json: unknown): OptionValues | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const e = Object.entries(json as Record<string, unknown>).filter((kv): kv is [string, string] => typeof kv[1] === 'string')
  return e.length ? Object.fromEntries(e) : null
}

/** Every combination, in the order the owner listed the options: Size S/M x Colour Red/Blue -> S Red, S Blue, M Red, M Blue. */
export function combinations(groups: OptionGroup[]): OptionValues[] {
  if (groups.length === 0) return []
  let acc: OptionValues[] = [{}]
  for (const g of groups) acc = acc.flatMap((a) => g.values.map((v) => ({ ...a, [g.name]: v })))
  return acc
}

/** "M / Red" */
export const variantLabel = (v: OptionValues, groups: OptionGroup[]) => groups.map((g) => v[g.name]).filter(Boolean).join(' / ')

/** A stable key to compare combinations regardless of case or option order. */
export const comboKey = (v: OptionValues) => Object.entries(v).map(([k, x]) => `${k.toLowerCase()}=${x.toLowerCase()}`).sort().join('|')

export interface ExistingVariant { id: string; optionValues: OptionValues | null; isActive: boolean }
export interface GenerationPlan { create: { values: OptionValues; label: string }[]; deactivate: string[]; reactivate: string[]; keep: number }

/**
 * What to do so the variants match the options. Variants without option values (added by hand) are never touched.
 * A combination that comes back after being removed is switched on again instead of duplicated.
 */
export function planGeneration(groups: OptionGroup[], existing: ExistingVariant[]): GenerationPlan {
  const wanted = combinations(groups)
  const wantedKeys = new Set(wanted.map(comboKey))
  const byKey = new Map<string, ExistingVariant>()
  for (const e of existing) if (e.optionValues) byKey.set(comboKey(e.optionValues), e)
  const create = wanted.filter((w) => !byKey.has(comboKey(w))).map((values) => ({ values, label: variantLabel(values, groups) }))
  const reactivate = wanted.map((w) => byKey.get(comboKey(w))).filter((e): e is ExistingVariant => !!e && !e.isActive).map((e) => e.id)
  const deactivate = existing.filter((e) => e.optionValues && e.isActive && !wantedKeys.has(comboKey(e.optionValues))).map((e) => e.id)
  return { create, deactivate, reactivate, keep: wanted.length - create.length }
}

/** SKU like "TSHIRT-M-RED": base + each value shortened to letters and digits; a number is added if it is taken. */
export function skuFor(base: string, values: OptionValues, groups: OptionGroup[], taken: ReadonlySet<string>): string {
  const part = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6)
  const stem = [base.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8) || 'SKU', ...groups.map((g) => part(values[g.name] ?? '')).filter(Boolean)].join('-').slice(0, 26)
  if (!taken.has(stem)) return stem
  for (let i = 2; i < 1000; i++) { const c = `${stem}-${i}`; if (!taken.has(c)) return c }
  return `${stem}-${taken.size + 1}`
}
