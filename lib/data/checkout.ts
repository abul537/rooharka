import { db } from '@/lib/db'
import type { PricingConfig, Wallet } from '@/lib/pricing'

export type CheckoutFieldKey =
  | 'firstName' | 'lastName' | 'email' | 'phone'
  | 'province' | 'city' | 'locality' | 'landmark' | 'addressType'

export interface CheckoutFieldConfig {
  enabled: boolean
  required: boolean
  label: string
}
export type CheckoutFields = Record<CheckoutFieldKey, CheckoutFieldConfig>

/**
 * These can never be switched off or made optional: without them an order cannot
 * be delivered, confirmed by phone or de-duplicated per customer.
 */
const LOCKED: CheckoutFieldKey[] = ['firstName', 'phone', 'province', 'city', 'locality']

const DEFAULT_LABELS: Record<CheckoutFieldKey, string> = {
  firstName: 'First Name',
  lastName: 'Last Name',
  email: 'Email',
  phone: 'Mobile Number',
  province: 'Province',
  city: 'City',
  locality: 'Locality',
  landmark: 'Landmark / House No, Street, Block',
  addressType: 'Address Type',
}

const KEYS = Object.keys(DEFAULT_LABELS) as CheckoutFieldKey[]

export interface CheckoutConfig {
  storeId: string
  storeSlug: string
  currency: string
  fields: CheckoutFields
  pricing: PricingConfig
  /** Most units of one item per order (Settings > Product page). */
  maxQuantity: number
  trackingEnabled: boolean
  trackingRequiresPhoneLast4: boolean
  /** The store makes customers verify their phone with a code before ordering. */
  phoneVerification: boolean
}

function parseWallets(extra: unknown): Wallet[] {
  const manual = (extra as { manualPayments?: Record<string, { accountTitle?: unknown; accountNumber?: unknown } | undefined> } | null)
    ?.manualPayments
  if (!manual || typeof manual !== 'object') return []
  const wallets: Wallet[] = []
  for (const [key, provider] of [['jazzcash', 'JAZZCASH'], ['easypaisa', 'EASYPAISA']] as const) {
    const w = manual[key]
    if (w && typeof w.accountNumber === 'string' && w.accountNumber.trim()) {
      wallets.push({
        provider,
        accountNumber: w.accountNumber.trim(),
        accountTitle: typeof w.accountTitle === 'string' ? w.accountTitle.trim() : '',
      })
    }
  }
  return wallets
}

/** Everything checkout needs to know about a store's rules, from the dashboard-controlled settings. */
export async function getCheckoutConfig(store: { id: string; slug: string }): Promise<CheckoutConfig> {
  const [settings, fieldRows, productBlock] = await Promise.all([
    db.storeSettings.findUnique({ where: { storeId: store.id } }),
    db.checkoutField.findMany({ where: { storeId: store.id } }),
    db.contentBlock.findUnique({ where: { storeId_page_key: { storeId: store.id, page: 'product', key: 'settings' } }, select: { data: true } }),
  ])
  const q = Number((productBlock?.data as { maxQuantity?: unknown } | null)?.maxQuantity)
  const maxQuantity = Number.isInteger(q) && q >= 1 && q <= 99 ? q : 10

  const byKey = new Map<string, { enabled: boolean; required: boolean; label: string | null }>(fieldRows.map((f) => [f.fieldKey, f]))
  const fields = {} as CheckoutFields
  for (const key of KEYS) {
    const row = byKey.get(key)
    const locked = LOCKED.includes(key)
    fields[key] = {
      enabled: locked ? true : row?.enabled ?? true,
      required: locked ? true : (row?.enabled ?? true) && (row?.required ?? false),
      label: row?.label?.trim() || DEFAULT_LABELS[key],
    }
  }

  const mode = settings?.advanceAmountMode
  return {
    storeId: store.id,
    storeSlug: store.slug,
    currency: settings?.currency ?? 'PKR',
    fields,
    pricing: {
      paymentPolicy: settings?.paymentPolicy ?? 'COD_ONLY',
      deliveryCharge: settings ? settings.deliveryCharge.toNumber() : 0,
      freeDeliveryOver: settings?.freeDeliveryOver ? settings.freeDeliveryOver.toNumber() : null,
      advanceMode: mode === 'FIXED' || mode === 'PERCENT' ? mode : 'DELIVERY_CHARGE',
      advanceValue: settings?.advanceAmountValue ? settings.advanceAmountValue.toNumber() : null,
      wallets: parseWallets(settings?.extra),
    },
    maxQuantity,
    trackingEnabled: settings?.orderTrackingEnabled ?? true,
    trackingRequiresPhoneLast4: settings?.trackingRequiresPhoneLast4 ?? true,
    phoneVerification: settings?.phoneVerificationEnabled ?? false,
  }
}

export interface CheckoutLine {
  variantId: string
  productName: string
  productSlug: string
  variantLabel: string
  imageUrl: string | null
  unitPrice: number
  stock: number
  trackStock: boolean
}

/** The product the customer is buying, read fresh from the database (never from the URL). */
export async function getCheckoutLine(storeId: string, variantId: string): Promise<CheckoutLine | null> {
  const v = await db.productVariant.findFirst({
    where: { id: variantId, isActive: true, product: { storeId, status: 'ACTIVE' } },
    include: {
      product: {
        select: {
          name: true,
          slug: true,
          media: { where: { media: { kind: 'IMAGE' } }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1, select: { media: { select: { url: true } } } },
        },
      },
    },
  })
  if (!v) return null
  return {
    variantId: v.id,
    productName: v.product.name,
    productSlug: v.product.slug,
    variantLabel: v.label,
    imageUrl: v.product.media[0]?.media.url ?? null,
    unitPrice: v.price.toNumber(),
    stock: v.stock,
    trackStock: v.trackStock,
  }
}
