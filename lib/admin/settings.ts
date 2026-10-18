import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import { DEFAULT_PRODUCT_PAGE_SETTINGS, type ProductPageSettings } from '@/lib/data/product'
import type { FieldRow, PaymentSettings, ProductPageInput, StoreInfo } from './settings-rules'

type Json = Prisma.InputJsonValue

/** Everything the Settings page shows, in one round trip. */
export async function loadSettings(storeId: string) {
  const [s, fields, block] = await Promise.all([
    db.storeSettings.findUnique({ where: { storeId } }),
    db.checkoutField.findMany({ where: { storeId } }),
    db.contentBlock.findUnique({ where: { storeId_page_key: { storeId, page: 'product', key: 'settings' } }, select: { data: true } }),
  ])
  const manual = ((s?.extra ?? {}) as { manualPayments?: Record<string, { accountNumber?: string; accountTitle?: string }> }).manualPayments ?? {}
  return {
    settings: s && {
      displayName: s.displayName, supportPhone: s.supportPhone ?? '', supportWhatsapp: s.supportWhatsapp ?? '', supportEmail: s.supportEmail ?? '',
      paymentPolicy: s.paymentPolicy, deliveryCharge: s.deliveryCharge.toNumber(), freeDeliveryOver: s.freeDeliveryOver?.toNumber() ?? null,
      advanceAmountMode: s.advanceAmountMode, advanceAmountValue: s.advanceAmountValue?.toNumber() ?? null,
      orderTrackingEnabled: s.orderTrackingEnabled, trackingRequiresPhoneLast4: s.trackingRequiresPhoneLast4,
    },
    wallets: {
      jazzcash: { accountNumber: manual.jazzcash?.accountNumber ?? '', accountTitle: manual.jazzcash?.accountTitle ?? '', enabled: !!manual.jazzcash?.accountNumber },
      easypaisa: { accountNumber: manual.easypaisa?.accountNumber ?? '', accountTitle: manual.easypaisa?.accountTitle ?? '', enabled: !!manual.easypaisa?.accountNumber },
    },
    fields: new Map<string, { enabled: boolean; required: boolean; label: string | null }>(fields.map((f) => [f.fieldKey, f])),
    productPage: { ...DEFAULT_PRODUCT_PAGE_SETTINGS, ...((block?.data ?? {}) as Partial<ProductPageSettings>) },
  }
}

export async function saveStoreInfo(storeId: string, v: StoreInfo) {
  await db.storeSettings.update({ where: { storeId }, data: v })
}

export async function savePayments(storeId: string, v: PaymentSettings) {
  const { wallets, ...rest } = v
  await db.$transaction(async (tx) => {
    const current = await tx.storeSettings.findUnique({ where: { storeId }, select: { extra: true } })
    // Keep every other key in `extra`; only replace the wallets.
    const extra = { ...((current?.extra ?? {}) as Record<string, unknown>), manualPayments: wallets } as Json
    await tx.storeSettings.update({ where: { storeId }, data: { ...rest, extra } })
  })
}

export async function saveCheckoutFields(storeId: string, rows: FieldRow[]) {
  await db.$transaction(rows.map((r) =>
    db.checkoutField.upsert({
      where: { storeId_fieldKey: { storeId, fieldKey: r.fieldKey } },
      create: { storeId, ...r },
      update: { label: r.label, enabled: r.enabled, required: r.required, sortOrder: r.sortOrder },
    })))
}

export async function saveTracking(storeId: string, v: { orderTrackingEnabled: boolean; trackingRequiresPhoneLast4: boolean }) {
  await db.storeSettings.update({ where: { storeId }, data: v })
}

export async function saveProductPage(storeId: string, v: ProductPageInput) {
  const data = v as unknown as Json
  await db.contentBlock.upsert({
    where: { storeId_page_key: { storeId, page: 'product', key: 'settings' } },
    create: { storeId, page: 'product', key: 'settings', data },
    update: { data },
  })
}
