import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import type { StoreAdmin } from '@/lib/auth/guard'
import { uniqueSlug } from '@/lib/admin/slug'
import { logStock } from '@/lib/stock-log'
import { planImport, type ExistingVariant, type ImportPlan } from '@/lib/admin/product-import'

/** The store's variants by SKU (upper case), for the import plan. Only this store's. */
export async function existingVariants(storeId: string): Promise<Map<string, ExistingVariant>> {
  const rows = await db.productVariant.findMany({ where: { product: { storeId } }, select: { id: true, productId: true, sku: true, price: true, stock: true, label: true, product: { select: { name: true, type: true } } }, take: 20_000 })
  return new Map(rows.map((v) => [v.sku.toUpperCase(), { id: v.id, productId: v.productId, sku: v.sku, price: v.price.toNumber(), stock: v.stock, measured: v.product.type === 'MEASURABLE', label: v.label, productName: v.product.name }]))
}

export const previewImport = async (storeId: string, text: string): Promise<ImportPlan> => planImport(text, await existingVariants(storeId))

/**
 * Carries the plan out, in ONE transaction: either every good row is applied or none. Stock changes go through
 * the stock history. New products are drafts. Nothing is deleted.
 */
export async function runImport(admin: StoreAdmin, text: string): Promise<ImportPlan> {
  const storeId = admin.storeId
  const plan = planImport(text, await existingVariants(storeId))
  if (plan.updates.length === 0 && plan.creates.length === 0) return plan
  await db.$transaction(async (tx) => {
    for (const u of plan.updates) {
      // The variant is named together with its store: a row can never reach another shop's product.
      if (Object.keys(u.data).length) await tx.productVariant.updateMany({ where: { id: u.id, product: { storeId } }, data: u.data })
      if (u.stockDelta !== 0) {
        const res = await tx.productVariant.updateMany({ where: { id: u.id, product: { storeId } }, data: { stock: { increment: u.stockDelta } } })
        if (res.count > 0) await logStock(tx, storeId, [{ productId: u.productId, variantId: u.id, delta: u.stockDelta, reason: 'IMPORT', userId: admin.id }])
      }
    }
    if (plan.creates.length) {
      const [slugs, skus, categories] = await Promise.all([
        tx.product.findMany({ where: { storeId }, select: { slug: true } }),
        tx.productVariant.findMany({ where: { product: { storeId } }, select: { sku: true } }),
        tx.category.findMany({ where: { storeId }, select: { id: true, name: true } }),
      ])
      const takenSlug = new Set<string>(slugs.map((s: { slug: string }) => s.slug)), takenSku = new Set<string>(skus.map((s: { sku: string }) => s.sku.toUpperCase()))
      const categoryId = new Map<string, string>(categories.map((c: { id: string; name: string }) => [c.name.toLowerCase(), c.id]))
      for (const p of plan.creates) {
        const slug = uniqueSlug(p.slug.slice(0, 56), takenSlug); takenSlug.add(slug)
        const variants = p.variants.map((v, i) => {
          let sku = v.sku && !takenSku.has(v.sku) ? v.sku : ''
          while (!sku || takenSku.has(sku)) sku = `${slug.toUpperCase().replace(/-/g, '').slice(0, 6) || 'SKU'}-${randomBytes(2).toString('hex').toUpperCase()}`
          takenSku.add(sku)
          return { storeId, label: v.label, sku, barcode: v.barcode, price: v.price, compareAtPrice: v.compareAtPrice, costPrice: v.costPrice, stock: v.stock, isActive: v.isActive, isDefault: i === 0, sortOrder: i }
        })
        const created = await tx.product.create({
          data: { storeId, name: p.name, slug, status: 'DRAFT', type: variants.length > 1 ? 'VARIANTS' : 'SIMPLE', vendor: p.vendor, tags: p.tags, categoryId: p.category ? categoryId.get(p.category.toLowerCase()) ?? null : null, variants: { create: variants } },
          select: { id: true, variants: { select: { id: true, stock: true } } },
        })
        await logStock(tx, storeId, created.variants.map((v: { id: string; stock: number }) => ({ productId: created.id, variantId: v.id, delta: v.stock, reason: 'IMPORT' as const, userId: admin.id })))
      }
    }
  }, { timeout: 60_000 })
  return plan
}
