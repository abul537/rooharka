/** Turns a plan's stored limits and features into the lines shown on the pricing page. Pure, so it is tested. */
export interface PlanLimits { products: number | null; ordersPerMonth: number | null; staff: number | null; tagline: string; popular: boolean }

const FEATURE_LABELS: Record<string, string> = {
  'sms-otp': 'Fake-order check by SMS code', 'whatsapp-otp': 'Fake-order check by WhatsApp code', jazzcash: 'JazzCash payments', easypaisa: 'EasyPaisa payments',
  tcs: 'TCS shipping', leopards: 'Leopards booking and tracking', postex: 'PostEx booking and tracking', 'order-tracking': 'Customer order tracking page',
}

/** Everything every plan includes. Kept to what the product really does. */
export const INCLUDED_IN_ALL = [
  'Pakistan address dropdowns: province, city, locality',
  'Cash on delivery, advance or full-payment rules you control',
  'Products with photos and video, catalog page',
  'Order management and customer profiles',
  'Courier choice: PostEx, Leopards, TCS or any local company',
  'Two-factor sign-in and encrypted API keys',
]

const num = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null)

export function readLimits(limits: unknown): PlanLimits {
  const l = (limits && typeof limits === 'object' ? limits : {}) as Record<string, unknown>
  return { products: num(l.products), ordersPerMonth: num(l.ordersPerMonth), staff: num(l.staff), tagline: typeof l.tagline === 'string' ? l.tagline.trim().slice(0, 90) : '', popular: l.popular === true }
}

const fmt = (n: number) => n.toLocaleString('en-PK')

export function describePlan(p: { limits: unknown; features: unknown }) {
  const l = readLimits(p.limits)
  const bullets = [
    l.products ? `Up to ${fmt(l.products)} products` : 'Unlimited products',
    l.ordersPerMonth ? `Up to ${fmt(l.ordersPerMonth)} orders a month` : 'Unlimited orders',
    l.staff ? `${fmt(l.staff)} staff login${l.staff === 1 ? '' : 's'}` : 'Unlimited staff logins',
    ...(Array.isArray(p.features) ? p.features.filter((k): k is string => typeof k === 'string' && k in FEATURE_LABELS).map((k) => FEATURE_LABELS[k]) : []),
  ]
  return { tagline: l.tagline, popular: l.popular, bullets }
}

/** Yearly saving in whole percent against twelve monthly payments, or null when there is none. */
export function yearlySaving(monthly: number, yearly: number | null): number | null {
  if (!yearly || monthly <= 0) return null
  const pct = Math.round((1 - yearly / (monthly * 12)) * 100)
  return pct > 0 ? pct : null
}
