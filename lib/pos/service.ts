import { db } from '@/lib/db'
import type { StoreAdmin } from '@/lib/auth/guard'
import { loadPosAccess } from '@/lib/entitlements/service'
import { generateTrackingCode } from '@/lib/tracking-code'
import { formatQuantity } from '@/lib/units/registry'
import { lineTotal, quantityProblem, stockLimited } from '@/lib/units/quantity'
import { WALK_IN_NAME, WALK_IN_PHONE, cashChange, posRule, saleTotals, splitPayments, type SaleRequest } from './rules'

/** An error whose message is safe to show to the person at the counter. */
export class PosError extends Error {}

const isUnique = (e: unknown) => (e as { code?: string })?.code === 'P2002'

export interface SaleResult { orderId: string; number: string; total: number; change: number }

/**
 * Rings up one counter sale as an ordinary order (source POS, already delivered and paid), so it shows in Orders,
 * customer profiles and reports. The server is the only authority on prices and stock; money is RECORDED only
 * (cash, card machine and wallet apps are used in the shop, nothing is charged from here).
 */
export async function ringUpSale(admin: StoreAdmin, req: SaleRequest): Promise<SaleResult> {
  const storeId = admin.storeId
  const [access, store, variants, existing] = await Promise.all([
    loadPosAccess(storeId),
    db.store.findUnique({ where: { id: storeId }, select: { slug: true } }),
    db.productVariant.findMany({
      where: { id: { in: req.items.map((i) => i.variantId) }, isActive: true, product: { storeId, status: 'ACTIVE' } },
      include: { product: { select: { id: true, name: true, type: true, unitCode: true, qtyMin: true, qtyStep: true, media: { where: { media: { kind: 'IMAGE' } }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1, select: { media: { select: { url: true } } } } } } },
    }),
    // The same sale sent twice (double tap, retry after a bad connection): hand back the first one.
    db.payment.findUnique({ where: { idempotencyKey: `pos:${storeId}:${req.idempotencyKey}` }, select: { rawResponse: true, order: { select: { id: true, number: true, total: true } } } }),
  ])
  if (!access.enabled) throw new PosError('POS lite is not switched on for your shop. Contact the platform owner.')
  if (!store) throw new PosError('Store not found.')
  if (existing) {
    const raw = (existing.rawResponse ?? {}) as { change?: number }
    return { orderId: existing.order.id, number: existing.order.number, total: existing.order.total.toNumber(), change: raw.change ?? 0 }
  }

  if (variants.length !== req.items.length) throw new PosError('One of the items is no longer on sale. Remove it and try again.')
  const lines = req.items.map((it) => {
    const v = variants.find((x) => x.id === it.variantId)!
    const unitPrice = v.price.toNumber()
    const unitCode = v.product.unitCode
    return { v, quantity: it.quantity, unitPrice, unitCode, lineTotal: lineTotal(unitPrice, it.quantity, unitCode) }
  })
  for (const l of lines) {
    const name = `${l.v.product.name} (${l.v.label})`
    if (stockLimited(l.v) && l.v.stock < l.quantity) {
      throw new PosError(l.v.stock > 0 ? `Only ${formatQuantity(l.v.stock, l.unitCode)} of “${name}” in stock.` : `“${name}” is out of stock.`)
    }
    const problem = quantityProblem(posRule(l.v.product, stockLimited(l.v) ? l.v.stock : null), l.quantity, `“${name}”`)
    if (problem) throw new PosError(problem)
  }
  const t = saleTotals(lines, req.discount)
  if (!t.ok) throw new PosError(t.error)
  const { subtotal, discount, total } = t.value
  // A split sale: the parts paid another way are taken off first; cash and change apply to what is left.
  const paid = splitPayments(total, req.paymentMethod, req.split ?? [])
  if (!paid.ok) throw new PosError(paid.error)
  const cash = req.paymentMethod === 'CASH' ? cashChange(paid.rest, req.tendered) : ({ ok: true, change: 0 } as const)
  if (!cash.ok) throw new PosError(cash.error)

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        for (const l of lines) {
          if (!l.v.trackStock) continue
          const r = await tx.productVariant.updateMany({ where: { id: l.v.id, ...(stockLimited(l.v) ? { stock: { gte: l.quantity } } : {}) }, data: { stock: { decrement: l.quantity } } })
          if (r.count === 0) throw new PosError(`“${l.v.product.name} (${l.v.label})” just sold out.`)
        }

        // A named phone number builds that customer's history; no phone means the store's single walk-in profile.
        const named = req.customerPhone !== null
        const customer = named
          ? await tx.customer.upsert({
              where: { storeId_phone: { storeId, phone: req.customerPhone! } },
              create: { storeId, phone: req.customerPhone!, firstName: req.customerName ?? 'Customer', ordersCount: 1, totalSpent: total, lastOrderAt: new Date() },
              update: { ...(req.customerName ? { firstName: req.customerName } : {}), ordersCount: { increment: 1 }, totalSpent: { increment: total }, lastOrderAt: new Date() },
            })
          : await tx.customer.upsert({ where: { storeId_phone: { storeId, phone: WALK_IN_PHONE } }, create: { storeId, phone: WALK_IN_PHONE, firstName: WALK_IN_NAME }, update: {} })

        const last = await tx.order.findFirst({ where: { storeId }, orderBy: { placedAt: 'desc' }, select: { number: true } })
        const number = String((parseInt(last?.number ?? '1000', 10) || 1000) + 1)
        const now = new Date()
        const order = await tx.order.create({
          data: {
            storeId, customerId: customer.id, number, trackingCode: generateTrackingCode(store.slug),
            source: 'POS', soldById: admin.id, status: 'DELIVERED', paymentStatus: 'PAID', paymentPolicy: 'FULL_ADVANCE',
            customerName: named ? (req.customerName ?? customer.firstName) : WALK_IN_NAME, customerPhone: named ? req.customerPhone! : '-',
            provinceName: 'In store', cityName: 'In store', localityName: 'In store',
            subtotal, deliveryCharge: 0, discount, total, amountPaid: total, amountDue: 0,
            items: { create: lines.map((l) => ({ productId: l.v.product.id, variantId: l.v.id, name: l.v.product.name, variantLabel: l.v.label, sku: l.v.sku, imageUrl: l.v.product.media[0]?.media.url ?? null, unitPrice: l.unitPrice, quantity: l.quantity, unitCode: l.unitCode, lineTotal: l.lineTotal })) },
            history: { create: { status: 'DELIVERED', note: `Counter sale rung up by ${admin.name}`, isPublic: false, createdById: admin.id } },
            // One payment row per way of paying. The first (the main method) carries the key that stops a double save.
            payments: { create: paid.value.map((p, i) => ({ method: p.method, purpose: 'FULL_PAYMENT' as const, status: 'SUCCEEDED' as const, amount: p.amount, paidAt: now, ...(i === 0 ? { idempotencyKey: `pos:${storeId}:${req.idempotencyKey}`, rawResponse: { tendered: req.tendered, change: cash.change } } : {}) })) },
          },
          select: { id: true },
        })
        return { orderId: order.id, number, total, change: cash.change }
      })
    } catch (e) {
      if (isUnique(e) && attempt < 4) {
        // Either a twin request already saved this sale, or two sales took the same order number: look, then retry.
        const twin = await db.payment.findUnique({ where: { idempotencyKey: `pos:${storeId}:${req.idempotencyKey}` }, select: { rawResponse: true, order: { select: { id: true, number: true, total: true } } } })
        if (twin) return { orderId: twin.order.id, number: twin.order.number, total: twin.order.total.toNumber(), change: ((twin.rawResponse ?? {}) as { change?: number }).change ?? 0 }
        continue
      }
      throw e
    }
  }
  throw new PosError('Could not save the sale. Please try again.')
}

/** Cancel a counter sale (customer returned the goods at once): stock goes back, the money is marked as refunded by hand. */
export async function voidSale(admin: StoreAdmin, orderId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, storeId: admin.storeId, source: 'POS' }, include: { items: true } })
    if (!order) throw new PosError('Counter sale not found.')
    const r = await tx.order.updateMany({ where: { id: order.id, status: 'DELIVERED' }, data: { status: 'CANCELLED', paymentStatus: 'REFUNDED', cancelledReason: reason.trim().slice(0, 300) || null } })
    if (r.count === 0) throw new PosError('This sale was already cancelled.')
    for (const it of order.items) if (it.variantId) await tx.productVariant.updateMany({ where: { id: it.variantId, trackStock: true }, data: { stock: { increment: it.quantity } } })
    const c = await tx.customer.findUnique({ where: { id: order.customerId }, select: { phone: true, ordersCount: true, totalSpent: true } })
    if (c && c.phone !== WALK_IN_PHONE) await tx.customer.update({ where: { id: order.customerId }, data: { ordersCount: Math.max(0, c.ordersCount - 1), totalSpent: Math.max(0, c.totalSpent.toNumber() - order.total.toNumber()) } })
    await tx.payment.updateMany({ where: { orderId: order.id }, data: { status: 'REFUNDED' } })
    await tx.orderStatusHistory.create({ data: { orderId: order.id, status: 'CANCELLED', note: `Counter sale cancelled by ${admin.name}${reason.trim() ? `: ${reason.trim().slice(0, 300)}` : ''}. Give the money back by hand.`, isPublic: false, createdById: admin.id } })
    return { number: order.number, refund: order.total.toNumber() }
  })
}
