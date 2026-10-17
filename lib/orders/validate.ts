import { validateEmail, validateLandmark, validateName } from '@/lib/validation'
import { normalizePkMobile } from '@/lib/phone'
import type { CheckoutFields } from '@/lib/data/checkout'
import type { PaymentMethodCode } from '@/lib/pricing'

/** What the browser sends. Prices are deliberately NOT part of it: the server looks them up. */
export interface OrderRequest {
  items: { variantId: string; quantity: number }[]
  customer: { firstName: string; lastName?: string; email?: string; phone: string }
  address: { provinceId: string; cityId: string; localityId: string; landmark?: string; addressType?: string }
  paymentMethod: PaymentMethodCode
  transactionId?: string
  idempotencyKey: string
}

export interface ValidOrder {
  items: { variantId: string; quantity: number }[]
  customer: { firstName: string; lastName: string | null; email: string | null; phone: string }
  address: { provinceId: number; cityId: number; localityId: number; landmark: string | null; addressType: 'HOME' | 'OFFICE' | 'SHOP' }
  paymentMethod: PaymentMethodCode
  transactionId: string | null
  idempotencyKey: string
}

export type ValidationResult = { ok: true; value: ValidOrder } | { ok: false; errors: Record<string, string> }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const posInt = (v: unknown) => (typeof v === 'string' && /^\d{1,9}$/.test(v) && Number(v) > 0 ? Number(v) : null)

/** Checks an untrusted request body against the store's own checkout rules. */
export function validateOrderRequest(body: unknown, fields: CheckoutFields): ValidationResult {
  const errors: Record<string, string> = {}
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, any>
  const c = (b.customer ?? {}) as Record<string, unknown>
  const a = (b.address ?? {}) as Record<string, unknown>

  // ---- items
  const items: { variantId: string; quantity: number }[] = []
  if (!Array.isArray(b.items) || b.items.length === 0 || b.items.length > 20) {
    errors.items = 'Your order has no items.'
  } else {
    const merged = new Map<string, number>()
    for (const it of b.items) {
      const id = str(it?.variantId)
      const q = Number(it?.quantity)
      if (!id || !Number.isInteger(q) || q < 1 || q > 99) {
        errors.items = 'Invalid item or quantity.'
        break
      }
      merged.set(id, (merged.get(id) ?? 0) + q)
    }
    for (const [variantId, quantity] of merged) items.push({ variantId, quantity: Math.min(quantity, 99) })
  }

  // ---- customer (rules come from the dashboard-controlled field settings)
  const firstName = str(c.firstName)
  const lastName = str(c.lastName)
  const email = str(c.email)
  const phoneRaw = str(c.phone)

  const fn = validateName(firstName)
  if (fn) errors.firstName = fn
  if (fields.lastName.enabled && (fields.lastName.required || lastName)) {
    const e = validateName(lastName)
    if (e) errors.lastName = e
  }
  if (fields.email.enabled && (fields.email.required || email)) {
    const e = validateEmail(email)
    if (e) errors.email = e
  }
  const phone = normalizePkMobile(phoneRaw)
  if (!phone) errors.phone = 'Please enter a valid Pakistani mobile number (03XXXXXXXXX)'

  // ---- address
  const provinceId = posInt(a.provinceId)
  const cityId = posInt(a.cityId)
  const localityId = posInt(a.localityId)
  if (!provinceId) errors.province = 'Please select a province'
  if (!cityId) errors.city = 'Please select a city'
  if (!localityId) errors.locality = 'Please select a locality'

  const landmark = str(a.landmark)
  if (fields.landmark.enabled) {
    if (fields.landmark.required && !landmark) errors.landmark = 'Please enter your street / landmark'
    else {
      const e = validateLandmark(landmark)
      if (e) errors.landmark = e
    }
  }
  const typeRaw = str(a.addressType).toUpperCase()
  const addressType = (['HOME', 'OFFICE', 'SHOP'] as const).find((t) => t === typeRaw) ?? null
  if (fields.addressType.enabled && fields.addressType.required && !addressType) errors.addressType = 'Please select an address type'

  // ---- payment
  const method = str(b.paymentMethod) as PaymentMethodCode
  if (!['COD', 'JAZZCASH', 'EASYPAISA'].includes(method)) errors.paymentMethod = 'Please choose a payment method'
  const tid = str(b.transactionId)
  if (method !== 'COD' && !/^[A-Za-z0-9]{6,30}$/.test(tid)) {
    errors.transactionId = 'Enter the transaction ID from your payment receipt (6 to 30 letters or digits)'
  }

  const idempotencyKey = str(b.idempotencyKey)
  if (!/^[A-Za-z0-9-]{16,64}$/.test(idempotencyKey)) errors.idempotencyKey = 'Invalid request. Please refresh the page and try again.'

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      items,
      customer: { firstName, lastName: lastName || null, email: email || null, phone: phone! },
      address: { provinceId: provinceId!, cityId: cityId!, localityId: localityId!, landmark: landmark || null, addressType: addressType ?? 'HOME' },
      paymentMethod: method,
      transactionId: method === 'COD' ? null : tid,
      idempotencyKey,
    },
  }
}
