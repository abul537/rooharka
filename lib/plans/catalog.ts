/**
 * WHAT EACH PLAN INCLUDES: the one list every part of the platform reads (pricing page, sign-up, CSMI, the
 * store's dashboard, and the server checks behind every Pro feature). Pure, no database, unit-tested.
 *
 * The idea behind Basic and Pro:
 *   BASIC = everything a Pakistani shop needs to start selling online with cash on delivery, done properly.
 *           No commission on sales and no order limit, ever: a growing shop is never punished for growing.
 *   PRO   = the tools that PAY FOR THEMSELVES: stop fake COD orders before they ship, win back people who
 *           left at checkout, run discount codes and advertising, send order updates by SMS or WhatsApp,
 *           book every parcel automatically, take returns, sell at a counter, and use your own .pk/.com address.
 *
 * During the free trial a store gets EVERY Pro feature, so the owner feels what Pro does before choosing.
 */

/** Features only Pro includes. The key is what is stored in Plan.features and in a store's own switches. */
export const PRO_FEATURES = {
  'fraud-check': { label: 'Automatic fake-order check', short: 'Fake-order check', why: 'Every cash-on-delivery order is checked against the courier network, the buyer’s history and risky patterns. Risky ones wait for you before they ship, so fewer parcels come back.' },
  abandoned: { label: 'Win back unfinished checkouts', short: 'Unfinished checkouts', why: 'See who typed their name and phone at checkout but did not order, and message them on WhatsApp in one tap.' },
  discounts: { label: 'Discount codes', short: 'Discount codes', why: 'Percent or fixed-amount codes with a minimum order, dates and a usage limit: for Eid sales, influencers and returning customers.' },
  pixels: { label: 'Facebook, TikTok and Google ad tracking', short: 'Ad tracking', why: 'Your ads learn who buys: views, add to cart, checkout and purchases are reported to Meta, TikTok and Google Analytics.' },
  'sms-updates': { label: 'Order updates to customers by SMS or WhatsApp', short: 'Customer SMS updates', why: 'Customers are told automatically when their order is confirmed, shipped and delivered. Fewer “where is my order?” calls, fewer refused parcels.' },
  'auto-booking': { label: 'Automatic courier booking', short: 'Automatic booking', why: 'Every new order is booked with PostEx the moment it is placed. On Basic you book each order with one click.' },
  returns: { label: 'Returns and refunds', short: 'Returns', why: 'Customers ask for a return on their tracking page; you approve, receive the items back into stock and record the refund.' },
  pos: { label: 'POS lite: sell at your counter', short: 'POS lite', why: 'Sell in person from the same stock and products, with barcode scanning, split payments and receipts.' },
  'ai-writer': { label: 'AI product descriptions', short: 'AI writer', why: 'Write a good product description in seconds.' },
  'product-import': { label: 'Bulk product import from a spreadsheet', short: 'Spreadsheet import', why: 'Add many products or change many prices and stock numbers at once from Excel or Google Sheets.' },
  'product-designs': { label: 'Special page designs for hero products', short: 'Special product pages', why: 'Give your best sellers and bundles their own product page layout.' },
  'custom-domain': { label: 'Your own web address (.pk or .com)', short: 'Own web address', why: 'Your shop on your own name, like yourshop.pk, instead of a sub-address of the platform.' },
  'priority-support': { label: 'Priority support', short: 'Priority support', why: 'Your help requests are answered first.' },
} as const
export type ProFeature = keyof typeof PRO_FEATURES
export const PRO_FEATURE_KEYS = Object.keys(PRO_FEATURES) as ProFeature[]
export const isProFeature = (k: unknown): k is ProFeature => typeof k === 'string' && Object.hasOwn(PRO_FEATURES, k)

/** What EVERY plan includes. Kept to what the product really does. */
export const INCLUDED_IN_ALL = [
  'No commission on your sales and no limit on orders',
  'Your own online shop with a visual page designer (home, about, product and collection pages)',
  'Cart, cash on delivery, advance or full-payment rules you control',
  'JazzCash, EasyPaisa and bank transfer payments',
  'Pakistan address dropdowns: province, city, locality',
  'PostEx booking with one click, and the courier of your choice',
  'Customer order tracking page',
  'Customer reviews you approve, stock history, sharing previews for WhatsApp and Facebook',
  'Shop in English or Urdu',
  'A new-order email to you for every order',
  'Two-factor sign-in and encrypted keys',
] as const

/** The two plans as recommended. Prices are a starting point the platform owner can change in CSMI at any time. */
export interface PlanBlueprint { name: string; monthlyPrice: number; yearlyPrice: number; sortOrder: number; limits: { products?: number; staff: number; videoMb: number; tagline: string; popular: boolean }; features: ProFeature[] }
export const RECOMMENDED_PLANS: readonly PlanBlueprint[] = [
  {
    name: 'Basic', monthlyPrice: 2999, yearlyPrice: 29990, sortOrder: 1,
    limits: { products: 100, staff: 1, videoMb: 20, tagline: 'Everything you need to start selling online with cash on delivery.', popular: false },
    features: [],
  },
  {
    name: 'Pro', monthlyPrice: 6999, yearlyPrice: 69990, sortOrder: 2,
    limits: { staff: 5, videoMb: 50, tagline: 'Stop fake orders, win back lost sales and grow with ads.', popular: true },
    features: [...PRO_FEATURE_KEYS],
  },
]

/** A store's own switch for one feature, set in CSMI: on or off whatever the plan says. */
export type FeatureOverride = 'on' | 'off'
export function readOverrides(raw: unknown): Partial<Record<ProFeature, FeatureOverride>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Partial<Record<ProFeature, FeatureOverride>> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (isProFeature(k) && (v === 'on' || v === 'off')) out[k] = v
  return out
}

export type FeatureSource = 'plan' | 'trial' | 'store' | 'no-plan'
export interface FeatureAccess { on: ReadonlySet<ProFeature>; source: Partial<Record<ProFeature, FeatureSource>>; trial: boolean }

/**
 * Which Pro features this store may use. In order:
 *   1. the store's own switch in CSMI (on / off), which always wins;
 *   2. the free trial: everything on;
 *   3. the plan;
 *   4. a store with no plan at all (set up by hand before plans existed): everything on, as it had before.
 * POS keeps its older switch on the store (posMode), read here the same way.
 */
export function resolveFeatures(input: { planFeatures: unknown; subscriptionStatus: string | null; overrides: unknown; posMode?: string | null }): FeatureAccess {
  const own = readOverrides(input.overrides)
  if (input.posMode === 'ON') own.pos = 'on'
  if (input.posMode === 'OFF') own.pos = 'off'
  const noPlan = input.subscriptionStatus === null
  const trial = input.subscriptionStatus === 'TRIALING'
  const plan = new Set(Array.isArray(input.planFeatures) ? input.planFeatures.filter(isProFeature) : [])
  const on = new Set<ProFeature>(), source: FeatureAccess['source'] = {}
  for (const k of PRO_FEATURE_KEYS) {
    const has = own[k] ? own[k] === 'on' : noPlan || trial || plan.has(k)
    source[k] = own[k] ? 'store' : noPlan ? 'no-plan' : trial && !plan.has(k) ? 'trial' : 'plan'
    if (has) on.add(k)
  }
  return { on, source, trial }
}

/** The plan's product limit (null = unlimited), and the message when a store is at it. */
export function productLimitProblem(used: number, adding: number, limit: number | null): string | null {
  if (limit === null || used + adding <= limit) return null
  const left = Math.max(0, limit - used)
  return left === 0
    ? `Your plan includes up to ${limit.toLocaleString('en-PK')} products and all are in use. Upgrade to Pro for unlimited products, or delete products you no longer sell.`
    : `Your plan includes up to ${limit.toLocaleString('en-PK')} products; only ${left} more can be added. Upgrade to Pro for unlimited products.`
}

/** The refusal every server check gives for a Pro feature the store does not have. */
export const lockedMessage = (k: ProFeature) => `“${PRO_FEATURES[k].label}” is part of the Pro plan. See Plan and billing to upgrade.`

/** Features the CSMI store page switches one by one (POS has its own older switch on the same form). */
export const SWITCHABLE = PRO_FEATURE_KEYS.filter((k) => k !== 'pos')
/** Reads the CSMI form: for each feature `feat_<key>` = '' (follow the plan), 'on' or 'off'. Anything else is refused. */
export function parseOverrides(get: (name: string) => unknown): { ok: true; value: Partial<Record<ProFeature, FeatureOverride>> } | { ok: false; error: string } {
  const value: Partial<Record<ProFeature, FeatureOverride>> = {}
  for (const k of SWITCHABLE) {
    const v = String(get(`feat_${k}`) ?? '')
    if (v === 'on' || v === 'off') value[k] = v
    else if (v !== '') return { ok: false, error: `Choose “Follow the plan”, “On” or “Off” for ${PRO_FEATURES[k].short}.` }
  }
  return { ok: true, value }
}

// ------------------------------------------------------------------ the comparison table
export interface CompareRow { label: string; hint?: string; values: (string | boolean)[] }
export interface CompareGroup { title: string; rows: CompareRow[] }
interface ComparePlan { limits: unknown; features: unknown }
const lim = (l: unknown) => (l && typeof l === 'object' ? (l as Record<string, unknown>) : {})
const whole = (v: unknown, min: number) => (typeof v === 'number' && Number.isInteger(v) && v >= min ? v : null)

/** The rows of the "compare plans" table for any set of plans (pricing page and the dashboard's billing page). */
export function compareRows(plans: readonly ComparePlan[]): CompareGroup[] {
  const n = (v: number) => v.toLocaleString('en-PK')
  return [
    { title: 'Size', rows: [
      { label: 'Products', values: plans.map((p) => { const v = whole(lim(p.limits).products, 1); return v ? `Up to ${n(v)}` : 'Unlimited' }) },
      { label: 'Orders', values: plans.map((p) => { const v = whole(lim(p.limits).ordersPerMonth, 1); return v ? `Up to ${n(v)} a month` : 'Unlimited' }) },
      { label: 'Commission on sales', values: plans.map(() => 'None') },
      { label: 'Staff logins (besides you)', values: plans.map((p) => { const v = whole(lim(p.limits).staff, 0); return v === null ? 'Unlimited' : n(v) }) },
      { label: 'Product video size', values: plans.map((p) => `${whole(lim(p.limits).videoMb, 1) ?? 20} MB`) },
    ] },
    { title: 'Included in every plan', rows: INCLUDED_IN_ALL.filter((x) => !/commission/i.test(x)).map((label) => ({ label, values: plans.map(() => true) })) },
    { title: 'Grow and protect your sales', rows: PRO_FEATURE_KEYS.map((k) => ({ label: PRO_FEATURES[k].label, hint: PRO_FEATURES[k].why, values: plans.map((p) => Array.isArray(p.features) && p.features.includes(k)) })) },
  ]
}

/**
 * "Pro pays for itself": a refused cash-on-delivery parcel costs the shop the courier charge out and back plus
 * packing. ESTIMATE used only for this sentence (about Rs. 350 a parcel); the owner can see the real number in
 * his courier's statement.
 */
export const REFUSED_PARCEL_COST_ESTIMATE = 350
export function paysForItself(basicMonthly: number, proMonthly: number): string | null {
  const diff = proMonthly - basicMonthly
  if (!(diff > 0)) return null
  const parcels = Math.ceil(diff / REFUSED_PARCEL_COST_ESTIMATE)
  return `Pro costs Rs. ${diff.toLocaleString('en-PK')} a month more than Basic. A refused cash-on-delivery parcel costs a shop about Rs. ${REFUSED_PARCEL_COST_ESTIMATE} in courier charges both ways, so stopping about ${parcels} fake orders a month covers the difference, before counting the sales won back from unfinished checkouts.`
}
