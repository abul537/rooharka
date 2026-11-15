import { db } from '@/lib/db'
import { AdminError } from '@/lib/admin/orders'
import { lastFour } from '@/lib/phone'
import { logStock } from '@/lib/stock-log'
import { loadExtra } from '@/lib/admin/extra'
import { alreadyReturned, canMove, isOpen, pickReturnLines, readReturnLines, readReturnPolicy, refundCeiling, returnWindow, type OrderLine, type ReturnAsk } from '@/lib/returns'

type Actor = { id: string; storeId: string }
const NOT_FOUND = 'We could not find a delivered order with those details.'
const rs = (n: number) => `Rs. ${n.toLocaleString('en-PK')}`
const toLines = (items: { id: string; productId: string | null; variantId: string | null; name: string; variantLabel: string | null; quantity: number; unitCode: string | null; unitPrice: { toNumber(): number }; lineTotal: { toNumber(): number } }[]): OrderLine[] =>
  items.map((i) => ({ id: i.id, productId: i.productId, variantId: i.variantId, name: i.name, variantLabel: i.variantLabel, quantity: i.quantity, unitCode: i.unitCode, unitPrice: i.unitPrice.toNumber(), lineTotal: i.lineTotal.toNumber() }))
const ORDER_PARTS = { items: true, returns: { select: { id: true, status: true, items: true, refundAmount: true } }, history: { where: { status: 'DELIVERED' as const }, orderBy: { createdAt: 'desc' as const }, take: 1, select: { createdAt: true } } }

/**
 * THE CUSTOMER asks for a return from the tracking page. The order is found by its tracking code (and the phone
 * digits, when the shop asks for them) inside THIS shop only; every kind of miss gives the same answer.
 */
export async function requestReturn(storeId: string, ask: ReturnAsk, requirePhoneLast4: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const policy = readReturnPolicy(await loadExtra(storeId))
  if (!policy.enabled) return { ok: false, error: 'This shop does not take return requests online. Please contact the shop.' }
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { storeId, trackingCode: ask.code }, include: ORDER_PARTS })
    if (!order || (requirePhoneLast4 && ask.last4 !== lastFour(order.customerPhone))) return { ok: false as const, error: NOT_FOUND }
    const window = returnWindow(policy, { status: order.status, deliveredAt: order.history[0]?.createdAt ?? null }, order.returns.some((r) => isOpen(r.status)), new Date())
    if (!window.allowed) return { ok: false as const, error: order.returns.some((r) => isOpen(r.status)) ? 'A return for this order is already open.' : `Returns can be requested within ${policy.days} days of delivery.` }
    const picked = pickReturnLines(toLines(order.items), ask.items, alreadyReturned(order.returns))
    if (!picked.ok) return picked
    await tx.returnRequest.create({ data: { storeId, orderId: order.id, status: 'REQUESTED', reason: ask.reason, note: ask.note || null, items: picked.lines as object[], source: 'CUSTOMER' } })
    await tx.orderStatusHistory.create({ data: { orderId: order.id, status: order.status, note: 'Return requested', isPublic: true } })
    return { ok: true as const }
  })
}

/** THE OWNER starts a return themselves (the customer phoned): everything not returned yet, already approved. */
export async function startReturn(admin: Actor, orderId: string) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, storeId: admin.storeId }, include: ORDER_PARTS })
    if (!order) throw new AdminError('Order not found.')
    if (order.status !== 'DELIVERED') throw new AdminError('A return can be started only for a delivered order.')
    if (order.returns.some((r) => isOpen(r.status))) throw new AdminError('This order already has an open return.')
    const picked = pickReturnLines(toLines(order.items), [], alreadyReturned(order.returns))
    if (!picked.ok) throw new AdminError('Everything in this order has been returned already.')
    const row = await tx.returnRequest.create({ data: { storeId: admin.storeId, orderId: order.id, status: 'APPROVED', reason: 'OTHER', items: picked.lines as object[], source: 'OWNER', decidedById: admin.id }, select: { id: true } })
    await tx.orderStatusHistory.create({ data: { orderId: order.id, status: order.status, note: 'Return approved', isPublic: true, createdById: admin.id } })
    return { id: row.id, number: order.number }
  })
}

/** Yes or no to a customer's request. A refusal carries a reason the customer can read. */
export async function decideReturn(admin: Actor, id: string, approve: boolean, answer: string) {
  const to = approve ? 'APPROVED' : 'REJECTED'
  return db.$transaction(async (tx) => {
    const r = await tx.returnRequest.findFirst({ where: { id, storeId: admin.storeId }, select: { id: true, status: true, orderId: true, order: { select: { status: true, number: true } } } })
    if (!r) throw new AdminError('Return not found.')
    if (!canMove(r.status, to)) throw new AdminError('This return has already moved on. Reload the page.')
    if (!approve && answer.length < 5) throw new AdminError('Write a short reason for the customer.')
    // Compare-and-set: two people answering at once cannot both win.
    const res = await tx.returnRequest.updateMany({ where: { id, storeId: admin.storeId, status: r.status }, data: { status: to, answer: answer || null, decidedById: admin.id } })
    if (res.count === 0) throw new AdminError('This return was just changed by someone else. Reload the page.')
    await tx.orderStatusHistory.create({ data: { orderId: r.orderId, status: r.order.status, note: approve ? 'Return approved' : `Return not accepted: ${answer}`.slice(0, 300), isPublic: true, createdById: admin.id } })
    return { number: r.order.number, to }
  })
}

/**
 * The items arrived. With `restock`, they go back on the shelf (through the stock history). When every line of
 * the order has now come back, the order itself becomes "Returned".
 */
export async function receiveReturn(admin: Actor, id: string, restock: boolean) {
  return db.$transaction(async (tx) => {
    const r = await tx.returnRequest.findFirst({ where: { id, storeId: admin.storeId }, select: { id: true, status: true, orderId: true, items: true } })
    if (!r) throw new AdminError('Return not found.')
    if (!canMove(r.status, 'RECEIVED')) throw new AdminError('Only an approved return can be marked as received.')
    const res = await tx.returnRequest.updateMany({ where: { id, storeId: admin.storeId, status: 'APPROVED' }, data: { status: 'RECEIVED', restocked: restock, receivedAt: new Date() } })
    if (res.count === 0) throw new AdminError('This return was just changed by someone else. Reload the page.')
    const lines = readReturnLines(r.items)
    if (restock) {
      const back = []
      for (const l of lines) {
        if (!l.variantId || !l.productId) continue // the product was deleted since: nothing to put back
        const done = await tx.productVariant.updateMany({ where: { id: l.variantId, product: { storeId: admin.storeId } }, data: { stock: { increment: l.quantity } } })
        if (done.count > 0) back.push({ productId: l.productId, variantId: l.variantId, delta: l.quantity, reason: 'RETURN_RESTOCKED' as const, orderId: r.orderId, userId: admin.id })
      }
      await logStock(tx, admin.storeId, back)
    }
    const order = await tx.order.findFirst({ where: { id: r.orderId, storeId: admin.storeId }, include: { items: { select: { id: true, quantity: true } }, returns: { select: { status: true, items: true } } } })
    if (!order) throw new AdminError('Order not found.')
    const came = alreadyReturned(order.returns.filter((x) => x.status === 'RECEIVED' || x.status === 'COMPLETED'))
    const whole = order.items.every((i) => (came.get(i.id) ?? 0) >= i.quantity)
    if (whole && order.status === 'DELIVERED') await tx.order.updateMany({ where: { id: order.id, storeId: admin.storeId, status: 'DELIVERED' }, data: { status: 'RETURNED' } })
    await tx.orderStatusHistory.create({ data: { orderId: order.id, status: whole && order.status === 'DELIVERED' ? 'RETURNED' : order.status, note: 'Returned items received by the shop', isPublic: true, createdById: admin.id } })
    return { number: order.number, restocked: restock, whole }
  })
}

/**
 * The refund was sent (by the owner, outside the platform) and is recorded here. It can never be more than the
 * customer paid, counted over ALL returns of the order; the order row is locked while that is checked.
 */
export async function completeReturn(admin: Actor, id: string, parse: (ceiling: number) => { ok: true; value: { amount: number; method: string | null; ref: string | null } } | { ok: false; error: string }) {
  return db.$transaction(async (tx) => {
    const r = await tx.returnRequest.findFirst({ where: { id, storeId: admin.storeId }, select: { id: true, status: true, orderId: true } })
    if (!r) throw new AdminError('Return not found.')
    if (!canMove(r.status, 'COMPLETED')) throw new AdminError('Mark the items as received first.')
    // Touching the order takes its row lock: two refunds of one order are checked one after the other.
    await tx.order.updateMany({ where: { id: r.orderId, storeId: admin.storeId }, data: { updatedAt: new Date() } })
    const order = await tx.order.findFirst({ where: { id: r.orderId, storeId: admin.storeId }, select: { id: true, number: true, status: true, amountPaid: true, returns: { where: { status: 'COMPLETED' }, select: { refundAmount: true } } } })
    if (!order) throw new AdminError('Order not found.')
    const before = order.returns.reduce((s, x) => s + (x.refundAmount?.toNumber() ?? 0), 0), paid = order.amountPaid.toNumber()
    const parsed = parse(refundCeiling(paid, before))
    if (!parsed.ok) throw new AdminError(parsed.error)
    const { amount, method, ref } = parsed.value
    const res = await tx.returnRequest.updateMany({ where: { id, storeId: admin.storeId, status: 'RECEIVED' }, data: { status: 'COMPLETED', refundAmount: amount, refundMethod: method, refundRef: ref, completedAt: new Date() } })
    if (res.count === 0) throw new AdminError('This return was just changed by someone else. Reload the page.')
    if (paid > 0 && before + amount >= paid) await tx.order.updateMany({ where: { id: order.id, storeId: admin.storeId }, data: { paymentStatus: 'REFUNDED' } })
    await tx.orderStatusHistory.create({ data: { orderId: order.id, status: order.status, note: amount > 0 ? `Refund of ${rs(amount)} sent${method ? ` by ${method}` : ''}` : 'Return completed', isPublic: true, createdById: admin.id } })
    return { number: order.number, amount }
  })
}
