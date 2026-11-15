/**
 * THE FAKE-ORDER CHECK: the rules. Pure (no database, no network), so every decision is unit-tested.
 *
 * Every cash-on-delivery order is scored before dispatch from signals that cost nothing at checkout:
 *   1. the phone number itself (a real Pakistani mobile number, not a made-up one),
 *   2. the trust network: this number's delivered and refused parcels across EVERY store on the platform,
 *   3. an IP risk score for larger orders (the store's own IPQualityScore account, optional),
 *   4. speed and history: many orders in a day, a refused parcel before, an unusually large first order.
 * They combine into ONE decision the owner sees: CLEAR (carry on), REVIEW (held, with reasons) or BLOCK (no courier).
 * The owner can always overrule it after checking the order themselves.
 */
export type RiskLabel = 'TRUSTED' | 'NEUTRAL' | 'RISKY'
export type Verdict = 'CLEAR' | 'REVIEW' | 'BLOCK'

// ------------------------------------------------------------------ settings (per store, with safe defaults)
export interface FraudSettings {
  enabled: boolean
  /** More than this many cash-on-delivery orders from one phone in 24 hours (all stores together) is blocked. */
  velocityLimit: number
  /** Orders above this value (Rs.) are also sent to the IP risk service, when the store has connected one. */
  ipCheckOver: number
  /** A first-time buyer ordering more than this many times the store's usual first order is held for review. */
  firstOrderMultiple: number
}
export const DEFAULT_FRAUD_SETTINGS: FraudSettings = { enabled: true, velocityLimit: 3, ipCheckOver: 5000, firstOrderMultiple: 3 }
export const FRAUD_LIMITS = { velocityLimit: [1, 20], ipCheckOver: [0, 1_000_000], firstOrderMultiple: [2, 20] } as const

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const whole = (v: unknown, [min, max]: readonly [number, number], fallback: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,9}$/.test(v.trim()) ? Number(v.trim()) : NaN
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback
}
/** Reads the settings out of StoreSettings.extra. Anything missing or strange falls back to the default. */
export function readFraudSettings(extra: unknown): FraudSettings {
  const f = obj(obj(extra).fraud), d = DEFAULT_FRAUD_SETTINGS
  return {
    enabled: typeof f.enabled === 'boolean' ? f.enabled : d.enabled,
    velocityLimit: whole(f.velocityLimit, FRAUD_LIMITS.velocityLimit, d.velocityLimit),
    ipCheckOver: whole(f.ipCheckOver, FRAUD_LIMITS.ipCheckOver, d.ipCheckOver),
    firstOrderMultiple: whole(f.firstOrderMultiple, FRAUD_LIMITS.firstOrderMultiple, d.firstOrderMultiple),
  }
}
/** The settings form, checked. A number outside its range is refused with a readable message. */
export function parseFraudForm(get: (k: string) => unknown): { ok: true; value: FraudSettings } | { ok: false; error: string } {
  const num = (k: keyof typeof FRAUD_LIMITS, name: string) => {
    const [min, max] = FRAUD_LIMITS[k], n = whole(get(k), FRAUD_LIMITS[k], -1)
    return n === -1 ? `${name} must be a whole number from ${min} to ${max.toLocaleString('en-PK')}.` : n
  }
  const v = num('velocityLimit', 'Orders per day'), i = num('ipCheckOver', 'The order value'), m = num('firstOrderMultiple', 'The first-order multiple')
  for (const x of [v, i, m]) if (typeof x === 'string') return { ok: false, error: x }
  return { ok: true, value: { enabled: get('enabled') === 'on' || get('enabled') === true, velocityLimit: v as number, ipCheckOver: i as number, firstOrderMultiple: m as number } }
}

// ------------------------------------------------------------------ 1. the phone number
/**
 * Network codes in use by Pakistan's mobile companies (the two digits after the 3):
 * 00-09 Jazz, 10-19 Zong, 20-29 Jazz (Warid), 30-39 Ufone, 40-49 Telenor, 55 SCO.
 */
const liveCode = (code: number) => code <= 49 || code === 55
const straight = (d: string) => '01234567890'.includes(d) || '09876543210'.includes(d)

/**
 * Why a phone number cannot belong to a real buyer, or null when it looks genuine. No outside service is asked.
 * Accepts the stored form (+923XXXXXXXXX) or anything a person types (0300-1234567).
 */
export function phoneProblem(raw: string): string | null {
  const digits = (raw ?? '').replace(/[\s\-()+.]/g, '')
  const national = /^03\d{9}$/.test(digits) ? digits.slice(1) : /^923\d{9}$/.test(digits) ? digits.slice(2) : /^00923\d{9}$/.test(digits) ? digits.slice(4) : null
  if (!national) return 'This is not a Pakistani mobile number.'
  if (!liveCode(Number(national.slice(1, 3)))) return `No mobile company in Pakistan uses numbers starting with 0${national.slice(0, 3)}.`
  const subscriber = national.slice(3)
  if (/^(\d)\1{6}$/.test(subscriber)) return 'The number is one digit repeated (like 0300-0000000), which is how made-up numbers look.'
  if (straight(subscriber)) return 'The number is a straight run of digits (like 0300-1234567), which is how made-up numbers look.'
  return null
}

// ------------------------------------------------------------------ 2. the trust network
/** What all stores together know about one phone number (and its address). Counts only; never which store. */
export interface NetworkHistory {
  delivered: number
  /** Parcels that came back: refused at the door or never collected. */
  returned: number
  /** Other stores that put this number on their own block list. */
  blockedByStores: number
  /** Parcels returned from this same address under a DIFFERENT phone number. */
  addressReturned: number
}
/** The label from the platform's own history. One refusal among many deliveries does not make a buyer risky. */
export function networkLabel(n: NetworkHistory): RiskLabel {
  if (n.blockedByStores >= 1 || n.returned >= 2 || (n.returned >= 1 && n.delivered === 0)) {
    // A long-standing customer with a few returns among many deliveries is ordinary, not risky.
    if (n.blockedByStores === 0 && n.delivered >= 5 && n.returned / (n.delivered + n.returned) <= 0.25) return 'NEUTRAL'
    return 'RISKY'
  }
  return n.delivered >= 2 && n.returned === 0 ? 'TRUSTED' : 'NEUTRAL'
}
const RANK: Record<RiskLabel, number> = { TRUSTED: 0, NEUTRAL: 1, RISKY: 2 }
/** When a partner network also has an opinion, the more careful of the two labels stands. */
export const worseLabel = (a: RiskLabel, b: RiskLabel | null | undefined): RiskLabel => (b && RANK[b] > RANK[a] ? b : a)

// ------------------------------------------------------------------ 3. the IP risk score
export interface IpRisk { score: number; proxy: boolean; country: string | null }
/** What a 0 to 100 risk score means, using the service's own guidance (75 suspicious, 85 high risk). */
export const actionForScore = (score: number): 'allow' | 'review' | 'block' => (score >= 85 ? 'block' : score >= 75 ? 'review' : 'allow')

// ------------------------------------------------------------------ 5. one decision
export interface Signals {
  phone: string
  network: NetworkHistory
  /** A label from an outside partner network, when one is connected. */
  partnerLabel?: RiskLabel | null
  /** Cash-on-delivery orders from this phone in the last 24 hours on the whole platform, this one included. */
  codLast24h: number
  /** This store's own history with the buyer BEFORE this order. */
  own: { orders: number; delivered: number }
  total: number
  /** The store's average first order, or null while it has too few orders to say. */
  firstOrderAverage: number | null
  ip?: IpRisk | null
}
export interface Reason { code: string; text: string; level: 'block' | 'risk' | 'good' }
export interface Decision { status: Verdict; label: RiskLabel; reasons: Reason[]; riskScore: number | null; recommendedAction: string | null }

const times = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const rs = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`

/**
 * Combines the signals into one decision:
 *   BLOCK  = a made-up phone number, too many orders in a day, a risky label together with another warning,
 *            or three warnings of any kind;
 *   REVIEW = one or two warnings;
 *   CLEAR  = none.
 * Every reason is written for the store owner to read.
 */
export function decide(s: Signals, settings: FraudSettings = DEFAULT_FRAUD_SETTINGS): Decision {
  const reasons: Reason[] = []
  const n = s.network
  const label = worseLabel(networkLabel(n), s.partnerLabel)

  const phone = phoneProblem(s.phone)
  if (phone) reasons.push({ code: 'phone', level: 'block', text: phone })
  if (s.codLast24h > settings.velocityLimit) reasons.push({ code: 'velocity', level: 'block', text: `This phone number placed ${times(s.codLast24h, 'cash-on-delivery order')} in the last 24 hours across the platform (your limit is ${settings.velocityLimit}).` })

  if (label === 'RISKY') {
    const why = [n.returned > 0 ? `${times(n.returned, 'parcel')} sent to this number came back` : '', n.blockedByStores > 0 ? `${times(n.blockedByStores, 'other store')} blocked this number` : '', s.partnerLabel === 'RISKY' ? 'a partner network marks it risky' : ''].filter(Boolean).join(', and ')
    reasons.push({ code: 'label', level: 'risk', text: `Risky buyer: ${why}${n.delivered > 0 ? ` (${n.delivered} delivered)` : ''}.` })
  } else if (n.returned >= 1) {
    reasons.push({ code: 'refused', level: 'risk', text: `This number refused or did not collect ${times(n.returned, 'parcel')} before (${n.delivered} delivered).` })
  }
  if (n.addressReturned >= 1) reasons.push({ code: 'address', level: 'risk', text: `This same address sent back ${times(n.addressReturned, 'parcel')} ordered under a different phone number.` })
  if (s.ip) {
    if (s.ip.score >= 75) reasons.push({ code: 'ip-score', level: 'risk', text: `The buyer’s internet connection has a risk score of ${s.ip.score} out of 100${s.ip.proxy ? ' and hides its location (VPN or proxy)' : ''}.` })
    else if (s.ip.proxy) reasons.push({ code: 'ip-proxy', level: 'risk', text: 'The buyer is hiding their location behind a VPN or proxy.' })
    if (s.ip.country && s.ip.country !== 'PK') reasons.push({ code: 'ip-country', level: 'risk', text: `The order was placed from outside Pakistan (${s.ip.country}), but is to be delivered in Pakistan.` })
  }
  const firstTime = s.own.orders === 0 && n.delivered === 0
  if (firstTime && s.firstOrderAverage && s.total > s.firstOrderAverage * settings.firstOrderMultiple) {
    reasons.push({ code: 'first-large', level: 'risk', text: `A first-time buyer ordering ${rs(s.total)}: more than ${settings.firstOrderMultiple} times your usual first order (${rs(s.firstOrderAverage)}).` })
  }

  const blocks = reasons.filter((r) => r.level === 'block').length, risks = reasons.filter((r) => r.level === 'risk').length
  const status: Verdict = blocks > 0 || (label === 'RISKY' && risks >= 2) || risks >= 3 ? 'BLOCK' : risks > 0 ? 'REVIEW' : 'CLEAR'

  if (s.own.delivered > 0) reasons.push({ code: 'own', level: 'good', text: `Your own customer: ${times(s.own.delivered, 'order')} delivered by your shop before.` })
  else if (label === 'TRUSTED') reasons.push({ code: 'trusted', level: 'good', text: `Trusted buyer: ${times(n.delivered, 'parcel')} delivered on the platform, none refused.` })
  if (status === 'CLEAR' && !reasons.length) reasons.push({ code: 'clean', level: 'good', text: 'Real mobile number, no refused parcels, nothing unusual about this order.' })

  return { status, label, reasons, riskScore: s.ip ? s.ip.score : null, recommendedAction: s.ip ? actionForScore(s.ip.score) : null }
}

/** True while an order must not be packed, shipped or booked with a courier: the owner has to look at it first. */
export const isHeld = (o: { verificationStatus?: string | null }) => o.verificationStatus === 'REVIEW' || o.verificationStatus === 'BLOCK'
export const HELD_MESSAGE = 'This order is held by the fake-order check. Open the order, read the reasons, then approve it or cancel it.'
export const VERDICT_TEXT: Record<Verdict, { label: string; mark: string; about: string }> = {
  CLEAR: { label: 'Clear', mark: '✅', about: 'Nothing suspicious. The order carries on as usual.' },
  REVIEW: { label: 'Review', mark: '⚠️', about: 'Held until you check it. No courier is booked meanwhile.' },
  BLOCK: { label: 'Blocked', mark: '🚫', about: 'Looks like a fake order. No courier will be booked unless you approve it.' },
}
export const LABEL_TEXT: Record<RiskLabel, string> = { TRUSTED: 'Trusted', NEUTRAL: 'Neutral', RISKY: 'Risky' }

// ------------------------------------------------------------------ the history, summarised
export interface HistoryRow { id: string; storeId: string; status: string; placedAt: Date; cod: boolean }
/**
 * Turns the buyer's orders on the whole platform into the numbers the decision needs.
 * `orderId` = the order being checked (it counts towards today's speed, not towards the past).
 */
export function summariseHistory(rows: HistoryRow[], storeId: string, orderId: string, now = new Date()) {
  const dayAgo = now.getTime() - 86_400_000
  let delivered = 0, returned = 0, codLast24h = 0, ownOrders = 0, ownDelivered = 0
  for (const r of rows) {
    if (r.cod && r.status !== 'CANCELLED' && r.placedAt.getTime() >= dayAgo) codLast24h++
    if (r.id === orderId) continue
    if (r.status === 'DELIVERED') delivered++
    if (r.status === 'RETURNED') returned++
    if (r.storeId === storeId) { ownOrders++; if (r.status === 'DELIVERED') ownDelivered++ }
  }
  return { delivered, returned, codLast24h, own: { orders: ownOrders, delivered: ownDelivered } }
}

/** The message that opens in the owner's WhatsApp to ask the buyer to confirm (a reply, not a code). */
export function confirmMessage(o: { name: string; number: string; total: number; store: string; city: string }): string {
  const first = o.name.trim().split(/\s+/)[0] || 'there'
  return `Assalam o Alaikum ${first}, this is ${o.store}. We received your order #${o.number} of ${rs(o.total)} (cash on delivery) for ${o.city}. Please reply YES to confirm and we will send it today.`
}
