import { db } from '@/lib/db'
import { generateTrackingCode } from '@/lib/tracking-code'
import { buildPaymentOptions, type PaymentOption } from '@/lib/pricing'
import type { CheckoutConfig } from '@/lib/data/checkout'
import type { ValidOrder } from './validate'

/** Errors we expect and can explain to the customer. Anything else is a genuine bug (HTTP 500). */
export class OrderError extends Error {
  constructor(
    public code: 'ITEM_UNAVAILABLE' | 'OUT_OF_STOCK' | 'BAD_ADDRESS' | 'PAYMENT_UNAVAILABLE' | 'BLOCKED',
    message: string,
    public details?: Record<string, string>
  ) {
    super(message)
  }
}

export interface CreatedOrder {
  number: string
  trackingCode: string
  total: number
  advance: number
  dueOnDelivery: number
  paymentMethod: string
  awaitingPayment: boolean
}


const existingSelect = {
  method: true,
  amount: true,
  order: { select: { number: true, trackingCode: true, total: true } },
} as const

type ExistingPayment = { method: string; amount: { toNumber(): number }; order: { number: string; trackingCode: string; total: { toNumber(): number } } }

/** The order created earlier by a request with this idempotency key, if any. */
async function findExistingOrder(idempotencyKey: string): Promise<CreatedOrder | null> {
  const row = await db.payment.findUnique({ where: { idempotencyKey }, select: existingSelect })
  return row ? summarise(row) : null
}

function summarise(p: ExistingPayment): CreatedOrder {
  const total = p.order.total.toNumber()
  const advance = p.method === 'COD' ? 0 : p.amount.toNumber()
  return {
    number: p.order.number,
    trackingCode: p.order.trackingCode,
    total,
    advance,
    dueOnDelivery: total - advance,
    paymentMethod: p.method,
    awaitingPayment: advance > 0,
  }
}

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === 'P2002'

/**
 * Turns a validated request into a saved order. The server is the only authority on
 * prices, stock and payment rules: it ignores anything the browser claims about money.
 */
export async function createOrder(
  config: CheckoutConfig,
  input: ValidOrder,
  context: { ip: string }
): Promise<CreatedOrder> {
  const storeId = config.storeId

  // 0. The same button double-clicked / request retried: hand back the order we already made,
  //    before any stock check (the first request may have taken the last item).
  const already = await findExistingOrder(input.idempotencyKey)
  if (already) return already

  // 1. Items: real, active, belong to this store. Prices come from the database.
  const variants = await db.productVariant.findMany({
    where: { id: { in: input.items.map((i) => i.variantId) }, isActive: true, product: { storeId, status: 'ACTIVE' } },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          media: { where: { media: { kind: 'IMAGE' } }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1, select: { media: { select: { url: true } } } },
        },
      },
    },
  })
  if (variants.length !== input.items.length) {
    throw new OrderError('ITEM_UNAVAILABLE', 'One of the items in your order is no longer available.')
  }
  const lines = input.items.map((item) => {
    const v = variants.find((x) => x.id === item.variantId)!
    const unitPrice = v.price.toNumber()
    return { v, quantity: item.quantity, unitPrice, lineTotal: unitPrice * item.quantity }
  })
  for (const l of lines) {
    if (l.v.trackStock && l.v.stock < l.quantity) {
      throw new OrderError('OUT_OF_STOCK', l.v.stock > 0
        ? `Only ${l.v.stock} of "${l.v.product.name} (${l.v.label})" left in stock.`
        : `"${l.v.product.name} (${l.v.label})" is sold out.`)
    }
  }

  // 2. Money + payment rule for this store.
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0)
  const option: PaymentOption | undefined = buildPaymentOptions(config.pricing, subtotal).find((o) => o.method === input.paymentMethod)
  if (!option) {
    throw new OrderError('PAYMENT_UNAVAILABLE', 'That payment method is not available for this store. Please choose another.', { paymentMethod: 'Please choose another payment method' })
  }
  const { charges } = option
  const awaitingPayment = charges.advance > 0

  // 3. Address must be a real province > city > locality chain (not three unrelated ids).
  const locality = await db.locality.findFirst({
    where: { id: input.address.localityId, cityId: input.address.cityId, city: { provinceId: input.address.provinceId } },
    select: { name: true, city: { select: { name: true, province: { select: { name: true } } } } },
  })
  if (!locality) throw new OrderError('BAD_ADDRESS', 'Please re-select your province, city and locality.', { locality: 'Please re-select your address' })

  // 4. Known fake-order offenders are turned away.
  const blocked = await db.blocklistEntry.findFirst({
    where: { storeId, OR: [{ type: 'PHONE', value: input.customer.phone }, { type: 'IP', value: context.ip }] },
    select: { id: true },
  })
  if (blocked) throw new OrderError('BLOCKED', 'We are unable to process this order online. Please contact the store.')

  const customerName = [input.customer.firstName, input.customer.lastName].filter(Boolean).join(' ')
  const purpose = input.paymentMethod === 'COD' ? 'COD_COLLECTION' : charges.advance >= charges.total ? 'FULL_PAYMENT' : 'DELIVERY_ADVANCE'

  // 5. Save everything in ONE transaction: stock, customer, order, items, payment, history.
  //    Order numbers / tracking codes are unique; on the rare collision the whole transaction is retried.
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        // Same button double-clicked / request retried: return the order we already made.
        const existing = await tx.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: existingSelect })
        if (existing) return summarise(existing)

        // Stock: decrement only if enough is left. Two buyers can't both take the last bottle.
        for (const l of lines) {
          if (!l.v.trackStock) continue
          const res = await tx.productVariant.updateMany({
            where: { id: l.v.id, stock: { gte: l.quantity } },
            data: { stock: { decrement: l.quantity } },
          })
          if (res.count === 0) throw new OrderError('OUT_OF_STOCK', `"${l.v.product.name} (${l.v.label})" just sold out.`)
        }

        const customer = await tx.customer.upsert({
          where: { storeId_phone: { storeId, phone: input.customer.phone } },
          create: {
            storeId,
            phone: input.customer.phone,
            firstName: input.customer.firstName,
            lastName: input.customer.lastName,
            email: input.customer.email,
            ordersCount: 1,
            totalSpent: charges.total,
            lastOrderAt: new Date(),
          },
          update: {
            firstName: input.customer.firstName,
            lastName: input.customer.lastName,
            ...(input.customer.email ? { email: input.customer.email } : {}),
            ordersCount: { increment: 1 },
            totalSpent: { increment: charges.total },
            lastOrderAt: new Date(),
          },
        })

        const sameAddress = await tx.customerAddress.findFirst({
          where: { customerId: customer.id, localityId: input.address.localityId, landmark: input.address.landmark },
          select: { id: true },
        })
        if (!sameAddress) {
          await tx.customerAddress.create({
            data: {
              customerId: customer.id,
              type: input.address.addressType,
              provinceId: input.address.provinceId,
              cityId: input.address.cityId,
              localityId: input.address.localityId,
              landmark: input.address.landmark,
              isDefault: false,
            },
          })
        }

        const last = await tx.order.findFirst({ where: { storeId }, orderBy: { placedAt: 'desc' }, select: { number: true } })
        const number = String((parseInt(last?.number ?? '1000', 10) || 1000) + 1)
        const trackingCode = generateTrackingCode(config.storeSlug)

        await tx.order.create({
          data: {
            storeId,
            customerId: customer.id,
            number,
            trackingCode,
            status: 'PLACED',
            paymentStatus: 'UNPAID',
            paymentPolicy: config.pricing.paymentPolicy,
            customerName,
            customerPhone: input.customer.phone,
            customerEmail: input.customer.email,
            provinceName: locality.city.province.name,
            cityName: locality.city.name,
            localityName: locality.name,
            landmark: input.address.landmark,
            addressType: input.address.addressType,
            subtotal: charges.subtotal,
            deliveryCharge: charges.delivery,
            total: charges.total,
            amountPaid: 0,
            amountDue: charges.total, // nothing is confirmed as paid yet; a wallet advance is confirmed by the store
            items: {
              create: lines.map((l) => ({
                productId: l.v.product.id,
                variantId: l.v.id,
                name: l.v.product.name,
                variantLabel: l.v.label,
                sku: l.v.sku,
                imageUrl: l.v.product.media[0]?.media.url ?? null,
                unitPrice: l.unitPrice,
                quantity: l.quantity,
                lineTotal: l.lineTotal,
              })),
            },
            history: {
              create: [
                { status: 'PLACED', note: 'Order placed', isPublic: true },
                ...(awaitingPayment ? [{ status: 'PLACED' as const, note: 'Waiting for your payment to be confirmed', isPublic: true }] : []),
              ],
            },
            payments: {
              create: {
                method: input.paymentMethod,
                purpose,
                status: 'PENDING',
                amount: input.paymentMethod === 'COD' ? charges.total : charges.advance,
                providerRef: input.transactionId,
                idempotencyKey: input.idempotencyKey,
              },
            },
          },
        })

        return {
          number,
          trackingCode,
          total: charges.total,
          advance: charges.advance,
          dueOnDelivery: charges.dueOnDelivery,
          paymentMethod: input.paymentMethod,
          awaitingPayment,
        }
      })
    } catch (e) {
      if (isUniqueViolation(e) && attempt < 4) continue
      throw e
    }
  }
  throw new Error('Could not allocate an order number')
}
