import { db } from '@/lib/db'
import type { StoreAdmin } from '@/lib/auth/guard'
import { afterPaymentReceived, checkTransition, isValidTrackingNo, label, type OrderStatus } from './order-rules'
import type { Prisma } from '@/lib/generated/prisma/client'
import { ADAPTERS, type BookingInput } from '@/lib/couriers/adapters'
import { courierName, isKnownCourier, readCourierConfig } from '@/lib/couriers/config'
import { serviceDef } from '@/lib/services/registry'
import { getServiceSecrets, recordServiceResult } from '@/lib/services/store-services'
import { formatPrice } from '@/lib/format'

/** An error whose message is safe to show to the admin. */
export class AdminError extends Error {}

const note = (v: string | undefined | null) => (v ?? '').trim().slice(0, 300) || null

/** Loads an order ONLY if it belongs to the admin's own store. */
async function loadOrder(tx: Pick<typeof db, 'order'>, admin: StoreAdmin, orderId: string) {
  const order = await tx.order.findFirst({
    where: { id: orderId, storeId: admin.storeId },
    include: { payments: true, items: true },
  })
  if (!order) throw new AdminError('Order not found.')
  return order
}

/** Move an order forward (not cancel: that has its own function with restocking). */
export async function changeOrderStatus(admin: StoreAdmin, orderId: string, to: OrderStatus, publicNote?: string) {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, admin, orderId)
    if (to === 'CANCELLED') throw new AdminError('Use “Cancel order” to cancel.')
    const pendingAdvance = order.payments.some((p) => p.method !== 'COD' && p.status === 'PENDING')
    const check = checkTransition(order.status as OrderStatus, to, pendingAdvance)
    if (!check.ok) throw new AdminError(check.reason!)

    // Compare-and-set: if someone else changed the order meanwhile, this updates nothing.
    const paidFields: Record<string, unknown> = {}
    if (to === 'DELIVERED') {
      Object.assign(paidFields, { amountPaid: order.total, amountDue: 0, paymentStatus: 'PAID' })
    }
    const res = await tx.order.updateMany({ where: { id: order.id, status: order.status }, data: { status: to, ...paidFields } })
    if (res.count === 0) throw new AdminError('This order was just changed by someone else. Please refresh.')

    if (to === 'DELIVERED') {
      // The cash collected on delivery is recorded as a payment.
      const due = order.total.toNumber() - order.amountPaid.toNumber()
      const codRow = order.payments.find((p) => p.method === 'COD' && p.status === 'PENDING')
      if (codRow) {
        await tx.payment.update({ where: { id: codRow.id }, data: { status: 'SUCCEEDED', amount: due, paidAt: new Date() } })
      } else if (due > 0) {
        await tx.payment.create({ data: { orderId: order.id, method: 'COD', purpose: 'COD_COLLECTION', status: 'SUCCEEDED', amount: due, paidAt: new Date() } })
      }
    }
    await tx.orderStatusHistory.create({
      data: { orderId: order.id, status: to, note: note(publicNote) ?? label(to), isPublic: true, createdById: admin.id },
    })
    return { before: order.status, after: to, number: order.number }
  })
}

/** Cancel before dispatch: stock goes back on the shelf and the customer's totals are corrected. */
export async function cancelOrder(admin: StoreAdmin, orderId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, admin, orderId)
    const check = checkTransition(order.status as OrderStatus, 'CANCELLED', false)
    if (!check.ok) throw new AdminError('Only orders that have not been shipped can be cancelled. Use “Returned” after shipping.')

    const res = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: 'CANCELLED', cancelledReason: note(reason) },
    })
    if (res.count === 0) throw new AdminError('This order was just changed by someone else. Please refresh.')

    for (const item of order.items) {
      if (item.variantId) {
        await tx.productVariant.updateMany({ where: { id: item.variantId, trackStock: true }, data: { stock: { increment: item.quantity } } })
      }
    }
    const customer = await tx.customer.findUnique({ where: { id: order.customerId }, select: { ordersCount: true, totalSpent: true } })
    if (customer) {
      await tx.customer.update({
        where: { id: order.customerId },
        data: { ordersCount: Math.max(0, customer.ordersCount - 1), totalSpent: Math.max(0, customer.totalSpent.toNumber() - order.total.toNumber()) },
      })
    }
    await tx.payment.updateMany({ where: { orderId: order.id, status: 'PENDING' }, data: { status: 'FAILED' } })

    await tx.orderStatusHistory.create({
      data: { orderId: order.id, status: 'CANCELLED', note: note(reason) ? `Order cancelled: ${note(reason)}` : 'Order cancelled', isPublic: true, createdById: admin.id },
    })
    const paid = order.amountPaid.toNumber()
    if (paid > 0) {
      // Internal reminder: money was received, so a refund must be sent by hand.
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status: 'CANCELLED', note: `REFUND DUE: ${formatPrice(paid)} was received for this order`, isPublic: false, createdById: admin.id },
      })
    }
    return { before: order.status, refundDue: paid, number: order.number }
  })
}

/** The store confirms it received the customer's wallet advance. */
export async function confirmPayment(admin: StoreAdmin, orderId: string, paymentId: string) {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, admin, orderId)
    if (order.status === 'CANCELLED' || order.status === 'RETURNED') throw new AdminError('This order is closed.')
    const payment = order.payments.find((p) => p.id === paymentId)
    if (!payment || payment.method === 'COD') throw new AdminError('Payment not found.')

    const res = await tx.payment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'SUCCEEDED', paidAt: new Date() } })
    if (res.count === 0) throw new AdminError('This payment was already handled.')

    const summary = afterPaymentReceived(order.total.toNumber(), order.amountPaid.toNumber(), payment.amount.toNumber())
    await tx.order.update({ where: { id: order.id }, data: summary })
    await tx.orderStatusHistory.create({
      data: { orderId: order.id, status: order.status, note: `Payment of ${formatPrice(payment.amount.toNumber())} received. Thank you!`, isPublic: true, createdById: admin.id },
    })
    return { amount: payment.amount.toNumber(), reference: payment.providerRef, number: order.number }
  })
}

/** The store could not find the money / the transaction id was wrong. */
export async function rejectPayment(admin: StoreAdmin, orderId: string, paymentId: string) {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, admin, orderId)
    const payment = order.payments.find((p) => p.id === paymentId)
    if (!payment || payment.method === 'COD') throw new AdminError('Payment not found.')
    const res = await tx.payment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'FAILED' } })
    if (res.count === 0) throw new AdminError('This payment was already handled.')
    await tx.orderStatusHistory.create({
      data: { orderId: order.id, status: order.status, note: 'We could not verify your payment. Please contact the store.', isPublic: true, createdById: admin.id },
    })
    return { reference: payment.providerRef, number: order.number }
  })
}

/**
 * Records the parcel handed to a courier. Used for BOTH ways of shipping: the owner typed the
 * tracking number (any courier, including custom ones) or the courier's API returned it.
 */
export async function addShipment(admin: StoreAdmin, orderId: string, courier: string, trackingNo: string, raw?: unknown) {
  const tn = trackingNo.trim()
  if (!isValidTrackingNo(tn)) throw new AdminError('Enter the courier’s tracking number (4 to 40 letters, digits or dashes).')

  return db.$transaction(async (tx) => {
    const [order, settings] = await Promise.all([
      loadOrder(tx, admin, orderId),
      tx.storeSettings.findUnique({ where: { storeId: admin.storeId }, select: { extra: true } }),
    ])
    const config = readCourierConfig(settings?.extra)
    // Any courier the store has switched on, or one it used before (so old data keeps working).
    if (!isKnownCourier(config, courier)) throw new AdminError('Choose a courier.')
    if (order.status !== 'PACKED' && order.status !== 'SHIPPED') throw new AdminError('Mark the order as Packed before adding a shipment.')
    if (order.payments.some((p) => p.method !== 'COD' && p.status === 'PENDING')) throw new AdminError('Confirm or reject the advance payment first.')

    await tx.shipment.create({
      data: {
        orderId: order.id, courier, courierTrackingNo: tn, status: 'CREATED',
        codAmount: order.total.toNumber() - order.amountPaid.toNumber(),
        ...(raw !== undefined ? { rawResponse: raw as Prisma.InputJsonValue } : {}),
      },
    })
    if (order.status === 'PACKED') {
      const res = await tx.order.updateMany({ where: { id: order.id, status: 'PACKED' }, data: { status: 'SHIPPED' } })
      if (res.count === 0) throw new AdminError('This order was just changed by someone else. Please refresh.')
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status: 'SHIPPED', note: `Handed to ${courierName(config, courier)} (tracking no. ${tn})`, isPublic: true, createdById: admin.id },
      })
    }
    return { number: order.number, courier, trackingNo: tn }
  })
}

// Booking the same order twice at once (double click) must not create two parcels at the courier.
const booking = new Set<string>()

/** Books the parcel through the courier's API with the STORE'S OWN account, then records it like a manual shipment. */
export async function bookShipment(admin: StoreAdmin, orderId: string, courier: string) {
  const adapter = ADAPTERS[courier]
  if (!adapter) throw new AdminError('Automatic booking is not available for this courier. Book on their website and add the tracking number instead.')
  if (booking.has(orderId)) throw new AdminError('This order is already being booked. Please wait a moment.')
  booking.add(orderId)
  try {
    const [order, settings, secrets] = await Promise.all([
      db.order.findFirst({ where: { id: orderId, storeId: admin.storeId }, include: { payments: true, items: true, shipments: { select: { id: true } } } }),
      db.storeSettings.findUnique({ where: { storeId: admin.storeId }, select: { extra: true, displayName: true, supportPhone: true, supportEmail: true } }),
      getServiceSecrets(admin.storeId, courier),
    ])
    if (!order) throw new AdminError('Order not found.')
    const config = readCourierConfig(settings?.extra)
    const name = courierName(config, courier)
    if (!config.enabled.includes(courier)) throw new AdminError(`${name} is switched off in Settings.`)
    if (order.status !== 'PACKED') throw new AdminError(order.status === 'SHIPPED' ? 'This order is already shipped.' : 'Mark the order as Packed before booking a courier.')
    if (order.shipments.length > 0) throw new AdminError('This order already has a shipment.')
    if (order.payments.some((p) => p.method !== 'COD' && p.status === 'PENDING')) throw new AdminError('Confirm or reject the advance payment first.')

    const def = serviceDef(courier)!
    const complete = !!secrets?.enabled && def.credentials.filter((f) => f.required).every((f) => secrets.credentials[f.name]) && def.config.filter((f) => f.required).every((f) => secrets.config[f.name])
    if (!secrets || !complete) throw new AdminError(`Connect and switch on your ${name} account in Settings > Couriers first.`)

    const input: BookingInput = {
      orderNumber: order.number,
      customerName: order.customerName,
      email: order.customerEmail ?? '',
      phone: order.customerPhone.startsWith('+92') ? `0${order.customerPhone.slice(3)}` : order.customerPhone,
      address: [order.landmark, order.localityName].filter(Boolean).join(', '),
      city: order.cityName,
      codAmount: Math.max(0, order.total.toNumber() - order.amountPaid.toNumber()),
      itemCount: order.items.reduce((n, i) => n + i.quantity, 0),
      itemsSummary: order.items.map((i) => `${i.name}${i.variantLabel ? ` ${i.variantLabel}` : ''} x${i.quantity}`).join(', '),
      shipper: { name: settings?.displayName ?? 'Store', phone: settings?.supportPhone ?? '', email: settings?.supportEmail ?? '' },
    }
    const result = await adapter.book(input, secrets.credentials, secrets.config)
    if (!result.ok) throw new AdminError(result.error) // nothing was changed here
    await recordServiceResult(admin.storeId, courier, null)

    try {
      return { ...(await addShipment(admin, orderId, courier, result.trackingNo, result.raw)), name }
    } catch (e) {
      // The courier HAS the parcel but saving failed: say so loudly, so it is never booked a second time.
      console.error('[book shipment] booked but not saved', courier, result.trackingNo, e)
      throw new AdminError(`The parcel WAS booked with ${name} (tracking no. ${result.trackingNo}) but could not be saved here. Use “Add shipment” with this number so it is not booked twice.`)
    }
  } finally {
    booking.delete(orderId)
  }
}
