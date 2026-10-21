/**
 * Which couriers a store uses. Pure logic (no database), so every rule is unit-tested.
 *
 * Three kinds of courier exist:
 *  - built-in names (TCS, Leopards, PostEx, "Other"): the owner switches each on or off,
 *  - custom couriers the owner types in (any local company: name + optional tracking link),
 *  - "automatic" ones (PostEx, Leopards): parcels can be booked from the order page once the owner
 *    connects their own account in Settings. Everything else is booked on the courier's own
 *    website/app and the tracking number is typed in. Both ways end up as the same Shipment.
 *
 * Stored in StoreSettings.extra.couriers = { enabled: string[], default: string|null, custom: CustomCourier[] }.
 */
import type { Getter, Parsed } from '@/lib/admin/settings-rules'

export interface BuiltinCourier { key: string; name: string; /** Can be booked automatically once connected. */ auto: boolean }
export const BUILTIN_COURIERS: readonly BuiltinCourier[] = [
  { key: 'tcs', name: 'TCS', auto: false },
  { key: 'leopards', name: 'Leopards Courier', auto: true },
  { key: 'postex', name: 'PostEx', auto: true },
  { key: 'other', name: 'Other courier', auto: false },
]

export interface CustomCourier { key: string; name: string; trackingUrl: string | null }
export interface CourierConfig { enabled: string[]; defaultKey: string | null; custom: CustomCourier[] }

export const MAX_CUSTOM_COURIERS = 5
const CUSTOM_KEY = /^c-[a-z0-9-]{1,30}$/
/** The tracking link template must contain this, replaced by the parcel's tracking number. */
export const TRACKING_PLACEHOLDER = '{tn}'

/** What a store that never touched the setting gets: the three named couriers plus "Other". */
export const DEFAULT_COURIER_CONFIG: CourierConfig = { enabled: BUILTIN_COURIERS.map((c) => c.key), defaultKey: null, custom: [] }

const isBuiltin = (key: string) => BUILTIN_COURIERS.some((c) => c.key === key)

/** Reads `extra.couriers` defensively: anything unexpected falls back to defaults rather than crashing a page. */
export function readCourierConfig(extra: unknown): CourierConfig {
  const raw = (extra && typeof extra === 'object' ? (extra as Record<string, unknown>).couriers : undefined) as Record<string, unknown> | undefined
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_COURIER_CONFIG, enabled: [...DEFAULT_COURIER_CONFIG.enabled] }

  const custom: CustomCourier[] = []
  if (Array.isArray(raw.custom)) {
    for (const c of raw.custom.slice(0, MAX_CUSTOM_COURIERS)) {
      const r = c as Record<string, unknown>
      if (typeof r?.key === 'string' && CUSTOM_KEY.test(r.key) && typeof r.name === 'string' && r.name.trim()) {
        custom.push({ key: r.key, name: r.name.trim().slice(0, 40), trackingUrl: typeof r.trackingUrl === 'string' && r.trackingUrl ? r.trackingUrl : null })
      }
    }
  }
  const known = new Set([...BUILTIN_COURIERS.map((c) => c.key), ...custom.map((c) => c.key)])
  const enabled = Array.isArray(raw.enabled) ? [...new Set(raw.enabled.filter((k): k is string => typeof k === 'string' && known.has(k)))] : []
  const defaultKey = typeof raw.default === 'string' && enabled.includes(raw.default) ? raw.default : null
  return { enabled, defaultKey, custom }
}

export interface CourierOption { key: string; name: string; custom: boolean; isDefault: boolean; auto: boolean }

/**
 * The couriers shown on the order page, the default first. `connected` = keys of couriers whose
 * own account is saved and switched on (those get a "Book automatically" button).
 */
export function courierOptions(config: CourierConfig, connected: ReadonlySet<string> = new Set()): CourierOption[] {
  const all = [
    ...BUILTIN_COURIERS.map((c) => ({ key: c.key, name: c.name, custom: false, canAuto: c.auto })),
    ...config.custom.map((c) => ({ key: c.key, name: c.name, custom: true, canAuto: false })),
  ]
  const opts = all
    .filter((c) => config.enabled.includes(c.key))
    .map((c) => ({ key: c.key, name: c.name, custom: c.custom, isDefault: c.key === config.defaultKey, auto: c.canAuto && connected.has(c.key) }))
  return opts.sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
}

/**
 * Display name for any courier key, including ones switched off later (old shipments must keep their
 * name) and unknown keys (shown as-is).
 */
export function courierName(config: CourierConfig, key: string): string {
  return BUILTIN_COURIERS.find((c) => c.key === key)?.name ?? config.custom.find((c) => c.key === key)?.name ?? key
}

/** A customer-facing tracking link for a custom courier, or null when the owner gave none. */
export function trackingLink(config: CourierConfig, key: string, trackingNo: string | null): string | null {
  if (!trackingNo) return null
  const tpl = config.custom.find((c) => c.key === key)?.trackingUrl
  if (!tpl) return null
  return tpl.replace(TRACKING_PLACEHOLDER, encodeURIComponent(trackingNo))
}

const text = (g: Getter, k: string) => String(g.get(k) ?? '').trim()
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)

/** Checks an owner-typed tracking link: https only, must contain {tn}, no credentials. */
export function validateTrackingTemplate(v: string): string | null {
  if (v.length > 300) return 'The tracking link is too long.'
  if (!v.includes(TRACKING_PLACEHOLDER)) return `The tracking link must contain ${TRACKING_PLACEHOLDER} where the tracking number goes.`
  let u: URL
  try { u = new URL(v.replace(TRACKING_PLACEHOLDER, 'X')) } catch { return 'The tracking link is not a valid web address.' }
  if (u.protocol !== 'https:') return 'The tracking link must start with https://'
  if (u.username || u.password) return 'The tracking link must not contain a username or password.'
  return null
}

/**
 * Parses the courier form. Fields: `courier.<key>` (checkbox per built-in), `defaultCourier`,
 * and up to 5 custom rows `customKey{i}` (hidden, keeps the key stable on edit), `customName{i}`, `customUrl{i}`.
 */
export function parseCourierForm(g: Getter): Parsed<CourierConfig> {
  const custom: CustomCourier[] = []
  const usedKeys = new Set<string>()
  const usedNames = new Set<string>(BUILTIN_COURIERS.map((c) => c.name.toLowerCase()))
  for (let i = 0; i < MAX_CUSTOM_COURIERS; i++) {
    const name = text(g, `customName${i}`)
    if (!name) continue // an emptied row means "remove this courier"
    if (name.length < 2 || name.length > 40) return { ok: false, error: 'A courier name must be 2 to 40 characters.' }
    if (usedNames.has(name.toLowerCase())) return { ok: false, error: `“${name}” is listed twice.` }
    usedNames.add(name.toLowerCase())

    const url = text(g, `customUrl${i}`)
    if (url) { const e = validateTrackingTemplate(url); if (e) return { ok: false, error: `${name}: ${e}` } }

    let key = text(g, `customKey${i}`)
    if (!CUSTOM_KEY.test(key) || usedKeys.has(key)) {
      const base = `c-${slug(name) || 'courier'}`
      key = base
      for (let n = 2; usedKeys.has(key); n++) key = `${base}-${n}`
    }
    usedKeys.add(key)
    custom.push({ key, name, trackingUrl: url || null })
  }

  const enabled = [...BUILTIN_COURIERS.map((c) => c.key).filter((k) => g.get(`courier.${k}`) === 'on'), ...custom.map((c) => c.key)]
  if (enabled.length === 0) return { ok: false, error: 'Switch on at least one courier, otherwise you cannot ship orders.' }

  const wanted = text(g, 'defaultCourier')
  const defaultKey = enabled.includes(wanted) ? wanted : null
  return { ok: true, value: { enabled, defaultKey, custom } }
}

export const isKnownCourier = (config: CourierConfig, key: string) => isBuiltin(key) || config.custom.some((c) => c.key === key)
