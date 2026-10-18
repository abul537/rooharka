import { db } from '@/lib/db'
import type { StoreAdmin } from '@/lib/auth/guard'
import type { ProductEdit, VariantEdit } from './product-rules'
import { AdminError } from './orders'

export async function listProducts(storeId: string) {
  return db.product.findMany({
    where: { storeId }, orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, status: true, variants: { select: { price: true, stock: true, isActive: true, trackStock: true } } },
  })
}

export async function getProductForEdit(storeId: string, id: string) {
  return db.product.findFirst({
    where: { id, storeId },
    select: {
      id: true, name: true, subtitle: true, shortDescription: true, status: true, slug: true,
      variants: { orderBy: { sortOrder: 'asc' }, select: { id: true, sku: true, label: true, badge: true, price: true, compareAtPrice: true, stock: true, trackStock: true, isDefault: true, isActive: true } },
    },
  })
}

/** Saves the product and its sizes together. Returns what changed (for the audit log). */
export async function saveProduct(admin: StoreAdmin, productId: string, p: ProductEdit, variants: VariantEdit[], defaultId: string) {
  return db.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: productId, storeId: admin.storeId }, select: { id: true, name: true, status: true, variants: { select: { id: true, price: true, compareAtPrice: true, isActive: true } } } })
    if (!product) throw new AdminError('Product not found.')
    if (product.variants.length !== variants.length || !variants.every((v) => product.variants.some((x) => x.id === v.id))) {
      throw new AdminError('The sizes changed while you were editing. Please reload the page.')
    }
    await tx.product.update({ where: { id: product.id }, data: p })

    const changes: Record<string, unknown> = {}
    for (const v of variants) {
      const old = product.variants.find((x) => x.id === v.id)!
      if (old.price.toNumber() !== v.price) changes[`${v.label}.price`] = [old.price.toNumber(), v.price]
      if (old.isActive !== v.isActive) changes[`${v.label}.active`] = [old.isActive, v.isActive]
      await tx.productVariant.update({
        where: { id: v.id },
        data: { label: v.label, badge: v.badge, price: v.price, compareAtPrice: v.compareAtPrice, isActive: v.isActive, isDefault: v.id === defaultId },
      })
      const delta = v.stock - v.stockWas
      if (delta !== 0) {
        // Apply the difference so orders placed while the form was open are not overwritten.
        const after = await tx.productVariant.update({ where: { id: v.id }, data: { stock: { increment: delta } }, select: { stock: true } })
        if (after.stock < 0) await tx.productVariant.update({ where: { id: v.id }, data: { stock: 0 } })
        changes[`${v.label}.stockChange`] = delta
      }
    }
    if (product.status !== p.status) changes.status = [product.status, p.status]
    return changes
  })
}
