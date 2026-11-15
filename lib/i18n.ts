/**
 * THE SHOP'S LANGUAGE. The owner chooses English or Urdu (Settings, Store details). With Urdu, the shop reads
 * right to left and its fixed words (menu, buttons, cart, totals) are shown in Urdu. What the OWNER types
 * (product names, descriptions, page sections) is shown exactly as typed, in whichever language they wrote it.
 *
 * How it works: the English sentence itself is the key. `t(lang, 'Add to cart')` gives the Urdu sentence when
 * the shop is in Urdu and there is one; otherwise the English. So a sentence that has no Urdu yet simply stays
 * English: nothing can break, and adding Urdu for it is one line in the list below.
 */
export const LANGUAGES = { en: 'English', ur: 'اردو (Urdu)' } as const
export type Lang = keyof typeof LANGUAGES
export const isRtl = (lang: Lang) => lang === 'ur'
/** Fonts already on phones and computers (no download): Nastaliq where the device has it, then Naskh. */
export const URDU_FONT = '"Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", "Noto Naskh Arabic", "Geeza Pro", Tahoma, sans-serif'

export function readLanguage(extra: unknown): Lang {
  // Saved as one named group like every other setting in `extra`: { language: { language: 'ur' } }.
  const group = extra && typeof extra === 'object' ? (extra as Record<string, unknown>).language : null
  const v = group && typeof group === 'object' ? (group as Record<string, unknown>).language : null
  return v === 'ur' ? 'ur' : 'en'
}
export function parseLanguage(get: (name: string) => unknown): { ok: true; value: { language: Lang } } | { ok: false; error: string } {
  const v = String(get('language') ?? '')
  return Object.hasOwn(LANGUAGES, v) ? { ok: true, value: { language: v as Lang } } : { ok: false, error: 'Choose a language from the list.' }
}

export const UR = {
  // Menu and header
  'Home': 'ہوم', 'Shop': 'دکان', 'About': 'ہمارے بارے میں', 'Contact': 'رابطہ', 'Track order': 'آرڈر ٹریک کریں',
  'Search products': 'مصنوعات تلاش کریں', 'Open menu': 'مینو کھولیں', 'Close menu': 'مینو بند کریں', 'Menu': 'مینو',
  'Cart, empty': 'ٹوکری خالی ہے', 'Cart': 'ٹوکری', 'Learn more': 'مزید جانیں',
  // Footer
  'Explore': 'مزید دیکھیں', 'Contact us': 'ہم سے رابطہ کریں', 'Send us a message': 'ہمیں پیغام بھیجیں', 'All rights reserved.': 'جملہ حقوق محفوظ ہیں۔',
  // Product cards and the product page
  'Sold out': 'ختم ہو گیا', 'Out of stock': 'اسٹاک میں نہیں', 'Featured': 'خاص', 'From': 'سے', 'Draft': 'مسودہ',
  'Add to cart': 'ٹوکری میں ڈالیں', 'Added to cart ✓': 'ٹوکری میں ڈال دیا ✓', 'View cart': 'ٹوکری دیکھیں',
  'Your cart is full (20 different items). Please check out first.': 'آپ کی ٹوکری بھر گئی ہے (20 مختلف اشیاء)۔ پہلے آرڈر مکمل کریں۔',
  // Cart
  'Your cart': 'آپ کی ٹوکری', 'Your cart is empty.': 'آپ کی ٹوکری خالی ہے۔', 'Browse the shop': 'دکان دیکھیں', 'Remove': 'ہٹائیں',
  'Decrease quantity': 'تعداد کم کریں', 'Increase quantity': 'تعداد بڑھائیں', 'Subtotal': 'ذیلی کل',
  'Delivery and any discount code are added at checkout.': 'ڈیلیوری اور رعایتی کوڈ چیک آؤٹ پر شامل ہوں گے۔',
  'Checkout': 'چیک آؤٹ', 'Continue shopping': 'خریداری جاری رکھیں', 'Loading your cart…': 'آپ کی ٹوکری کھل رہی ہے…',
  'Could not load your cart.': 'آپ کی ٹوکری نہیں کھل سکی۔', 'We could not reach the shop. Check your connection and try again.': 'دکان سے رابطہ نہیں ہو سکا۔ اپنا انٹرنیٹ دیکھیں اور دوبارہ کوشش کریں۔',
  // Order summary at checkout
  'Order Summary': 'آرڈر کا خلاصہ', 'Discount code': 'رعایتی کوڈ', 'Apply': 'لگائیں', 'Discount': 'رعایت', 'Delivery': 'ڈیلیوری', 'Free': 'مفت',
  'Total': 'کل رقم', 'Pay now': 'ابھی ادا کریں', 'Pay on delivery': 'ڈیلیوری پر ادا کریں',
  'That discount code is not valid.': 'یہ رعایتی کوڈ درست نہیں۔', 'Could not check the code. Please try again.': 'کوڈ چیک نہیں ہو سکا۔ دوبارہ کوشش کریں۔',
} as const
export type Phrase = keyof typeof UR
/** The sentence in the shop's language. English in = English out when the shop is English or no Urdu exists yet. */
export const t = (lang: Lang, phrase: Phrase): string => (lang === 'ur' ? UR[phrase] : phrase)
