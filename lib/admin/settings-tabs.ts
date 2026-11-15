/**
 * THE SETTINGS PAGE, ORGANISED: every setting belongs to exactly one group, and the page shows one group at a
 * time (chosen by ?tab= in the address, so a group can be linked to and the Back button works).
 * `cards` names what each group contains; a test checks nothing is listed twice or left out.
 */
export const SETTINGS_TABS = [
  { key: 'general', label: 'Store details', about: 'Your shop’s name and how customers reach you.', cards: ['store'] },
  { key: 'payments', label: 'Payments and delivery', about: 'How customers pay and what delivery costs.', cards: ['payments'] },
  { key: 'checkout', label: 'Checkout and orders', about: 'The order form, the fake-order check, messages to customers, phone verification and order tracking.', cards: ['checkout-form', 'fraud', 'notify', 'otp', 'tracking'] },
  { key: 'couriers', label: 'Couriers', about: 'The delivery companies you use and automatic booking.', cards: ['postex', 'couriers'] },
  { key: 'product', label: 'Product page options', about: 'Switches for every product page: reviews, badges, stock warnings. The layout is set under Storefront.', cards: ['product-page'] },
  { key: 'connections', label: 'Connected services', about: 'Your own accounts for photos, videos, AI writing, ad pixels and IP risk scores.', cards: ['cloudinary', 'ai', 'ipqs', 'pixels'] },
] as const

export type SettingsTab = (typeof SETTINGS_TABS)[number]['key']

/** The group asked for in the address; anything unknown (or nothing) opens the first group. */
export function settingsTab(raw: unknown): SettingsTab {
  const v = Array.isArray(raw) ? raw[0] : raw
  return SETTINGS_TABS.find((t) => t.key === v)?.key ?? SETTINGS_TABS[0].key
}
export const settingsHref = (tab: SettingsTab) => (tab === SETTINGS_TABS[0].key ? '/admin/settings' : `/admin/settings?tab=${tab}`)
