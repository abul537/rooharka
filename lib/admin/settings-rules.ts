/**
 * Pure parsing + validation of the Settings forms. No database here, so every rule is unit-tested.
 * Each parser takes the raw FormData-like getter and returns either clean values or messages.
 */
import { normalizePkMobile } from '@/lib/phone'
import { validateEmail } from '@/lib/validation'

export type Getter = { get(name: string): FormDataEntryValue | null }
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

const text = (g: Getter, k: string) => String(g.get(k) ?? '').trim()
const flag = (g: Getter, k: string) => g.get(k) === 'on'
/** Whole, non-negative number, or null when blank / not a number. */
const whole = (s: string) => (/^\d{1,9}$/.test(s) ? Number(s) : null)
/** 0300-1234567 / +92 300 1234567 -> 03001234567 (how Pakistanis write and read it). */
const localPhone = (s: string) => { const n = normalizePkMobile(s); return n ? `0${n.slice(3)}` : null }

// ---------------------------------------------------------------- store info
export interface StoreInfo { displayName: string; supportPhone: string | null; supportWhatsapp: string | null; supportEmail: string | null }
export function parseStoreInfo(g: Getter): Parsed<StoreInfo> {
  const displayName = text(g, 'displayName')
  if (displayName.length < 2 || displayName.length > 60) return { ok: false, error: 'Store name must be 2 to 60 characters.' }
  const phone = text(g, 'supportPhone'), wa = text(g, 'supportWhatsapp'), email = text(g, 'supportEmail')
  const supportPhone = phone ? localPhone(phone) : null
  const supportWhatsapp = wa ? localPhone(wa) : null
  if (phone && !supportPhone) return { ok: false, error: 'Support phone must be a Pakistani mobile number like 03001234567.' }
  if (wa && !supportWhatsapp) return { ok: false, error: 'WhatsApp number must be a Pakistani mobile number like 03001234567.' }
  if (email && (email.length > 120 || validateEmail(email))) return { ok: false, error: 'Support email is not valid.' }
  return { ok: true, value: { displayName, supportPhone, supportWhatsapp, supportEmail: email || null } }
}

// ------------------------------------------------------- payments & delivery
export const POLICIES = ['COD_ONLY', 'DELIVERY_ADVANCE', 'FULL_ADVANCE', 'CUSTOMER_CHOICE'] as const
export const ADVANCE_MODES = ['DELIVERY_CHARGE', 'FIXED', 'PERCENT'] as const
export type WalletKey = 'jazzcash' | 'easypaisa'
export interface WalletInput { accountNumber: string; accountTitle: string }
export interface PaymentSettings {
  paymentPolicy: (typeof POLICIES)[number]
  deliveryCharge: number
  freeDeliveryOver: number | null
  advanceAmountMode: (typeof ADVANCE_MODES)[number]
  advanceAmountValue: number | null
  /** Only enabled wallets are present. */
  wallets: Partial<Record<WalletKey, WalletInput>>
}

export function parsePaymentSettings(g: Getter): Parsed<PaymentSettings> {
  const paymentPolicy = POLICIES.find((p) => p === text(g, 'paymentPolicy'))
  if (!paymentPolicy) return { ok: false, error: 'Choose a payment policy.' }

  const deliveryCharge = whole(text(g, 'deliveryCharge') || '0')
  if (deliveryCharge === null || deliveryCharge > 100_000) return { ok: false, error: 'Delivery charge must be a whole number from 0 to 100000.' }

  const freeRaw = text(g, 'freeDeliveryOver')
  const freeDeliveryOver = freeRaw ? whole(freeRaw) : null
  if (freeRaw && (freeDeliveryOver === null || freeDeliveryOver < 1)) return { ok: false, error: 'Free delivery amount must be a whole number above 0 (or leave it empty).' }

  const advanceAmountMode = ADVANCE_MODES.find((m) => m === text(g, 'advanceAmountMode')) ?? 'DELIVERY_CHARGE'
  let advanceAmountValue: number | null = null
  if (advanceAmountMode !== 'DELIVERY_CHARGE') {
    advanceAmountValue = whole(text(g, 'advanceAmountValue'))
    const max = advanceAmountMode === 'PERCENT' ? 100 : 1_000_000
    if (advanceAmountValue === null || advanceAmountValue < 1 || advanceAmountValue > max) {
      return { ok: false, error: advanceAmountMode === 'PERCENT' ? 'Advance percentage must be between 1 and 100.' : 'Advance amount must be a whole number above 0.' }
    }
  }

  const wallets: PaymentSettings['wallets'] = {}
  for (const [key, name] of [['jazzcash', 'JazzCash'], ['easypaisa', 'EasyPaisa']] as const) {
    if (!flag(g, `${key}Enabled`)) continue
    const accountNumber = localPhone(text(g, `${key}Number`))
    if (!accountNumber) return { ok: false, error: `${name}: enter the account's mobile number, like 03001234567.` }
    const accountTitle = text(g, `${key}Title`)
    if (accountTitle.length < 2 || accountTitle.length > 60) return { ok: false, error: `${name}: enter the account holder's name (2 to 60 characters).` }
    wallets[key] = { accountNumber, accountTitle }
  }
  if (paymentPolicy !== 'COD_ONLY' && Object.keys(wallets).length === 0) {
    return { ok: false, error: 'This policy asks customers to pay online first, so turn on at least one wallet (JazzCash or EasyPaisa) and fill in its number.' }
  }
  return { ok: true, value: { paymentPolicy, deliveryCharge, freeDeliveryOver, advanceAmountMode, advanceAmountValue, wallets } }
}

// ------------------------------------------------------------ checkout fields
/** Fields a store may hide or make optional. The rest (name, phone, province, city, locality) are always required. */
export const OPTIONAL_FIELDS = ['lastName', 'email', 'landmark', 'addressType'] as const
export const LOCKED_FIELDS = ['firstName', 'phone', 'province', 'city', 'locality'] as const
export const ALL_FIELDS = [...LOCKED_FIELDS, ...OPTIONAL_FIELDS] as const
export interface FieldRow { fieldKey: string; label: string | null; enabled: boolean; required: boolean; sortOrder: number }

export function parseCheckoutFields(g: Getter): Parsed<FieldRow[]> {
  const rows: FieldRow[] = []
  let order = 0
  for (const key of ['firstName', 'lastName', 'email', 'phone', 'province', 'city', 'locality', 'landmark', 'addressType'] as const) {
    const label = text(g, `${key}Label`)
    if (label.length > 40) return { ok: false, error: 'Field names must be 40 characters or fewer.' }
    const locked = (LOCKED_FIELDS as readonly string[]).includes(key)
    const enabled = locked || flag(g, `${key}Enabled`)
    rows.push({ fieldKey: key, label: label || null, enabled, required: locked || (enabled && flag(g, `${key}Required`)), sortOrder: order++ })
  }
  return { ok: true, value: rows }
}

// -------------------------------------------------------------------- tracking
export function parseTracking(g: Getter): Parsed<{ orderTrackingEnabled: boolean; trackingRequiresPhoneLast4: boolean }> {
  return { ok: true, value: { orderTrackingEnabled: flag(g, 'orderTrackingEnabled'), trackingRequiresPhoneLast4: flag(g, 'trackingRequiresPhoneLast4') } }
}

// ---------------------------------------------------------------- product page
export const TRUST_ICONS = ['truck', 'shield', 'leaf', 'clock', 'heart'] as const
export interface ProductPageInput {
  showReviews: boolean; showFaq: boolean; showTrustBadges: boolean; showStickyBuyBar: boolean; showStockCount: boolean
  lowStockThreshold: number; maxQuantity: number; buyButtonLabel: string
  badgeText: string | null; guaranteeText: string | null
  trustBadges: { icon: (typeof TRUST_ICONS)[number]; text: string }[]
}
export function parseProductPage(g: Getter): Parsed<ProductPageInput> {
  const lowStockThreshold = whole(text(g, 'lowStockThreshold') || '10')
  if (lowStockThreshold === null || lowStockThreshold > 1000) return { ok: false, error: 'Low-stock warning must be a whole number from 0 to 1000.' }
  const maxQuantity = whole(text(g, 'maxQuantity') || '10')
  if (maxQuantity === null || maxQuantity < 1 || maxQuantity > 99) return { ok: false, error: 'Maximum quantity must be from 1 to 99.' }
  const buyButtonLabel = text(g, 'buyButtonLabel') || 'Order Now'
  if (buyButtonLabel.length > 30) return { ok: false, error: 'Buy button text must be 30 characters or fewer.' }
  const badgeText = text(g, 'badgeText'), guaranteeText = text(g, 'guaranteeText')
  if (badgeText.length > 80) return { ok: false, error: 'Badge text must be 80 characters or fewer.' }
  if (guaranteeText.length > 200) return { ok: false, error: 'Guarantee text must be 200 characters or fewer.' }
  const trustBadges: ProductPageInput['trustBadges'] = []
  for (let i = 0; i < 5; i++) {
    const t = text(g, `trustText${i}`)
    if (!t) continue
    if (t.length > 60) return { ok: false, error: 'Each trust badge must be 60 characters or fewer.' }
    const icon = TRUST_ICONS.find((x) => x === text(g, `trustIcon${i}`)) ?? 'shield'
    trustBadges.push({ icon, text: t })
  }
  return {
    ok: true,
    value: {
      showReviews: flag(g, 'showReviews'), showFaq: flag(g, 'showFaq'), showTrustBadges: flag(g, 'showTrustBadges'),
      showStickyBuyBar: flag(g, 'showStickyBuyBar'), showStockCount: flag(g, 'showStockCount'),
      lowStockThreshold, maxQuantity, buyButtonLabel, badgeText: badgeText || null, guaranteeText: guaranteeText || null, trustBadges,
    },
  }
}
