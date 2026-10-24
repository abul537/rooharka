import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import type { CostFormInput, NewStoreInput, PlanInput, StatusInput, SubscriptionInput } from '@/lib/csmi/forms'
import { addPeriod, intervalOf, invoiceLines, invoiceTotals, nextInvoiceNumber, periodPrice, type BillingInterval } from '@/lib/csmi/rules'

/** A problem whose message is safe to show to the platform owner. */
export class CsmiError extends Error {}

const DAY = 86_400_000
const num = (d: { toNumber(): number } | null | undefined) => (d ? d.toNumber() : 0)
const isUnique = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'
type Tx = Prisma.TransactionClient

// ------------------------------------------------------------------- stores
/** Adds a store (a customer's shop). It starts as a TRIAL; the owner's login is made with `pnpm admin:create`. */
export async function createStore(input: NewStoreInput) {
  const plan = input.planId ? await db.plan.findFirst({ where: { id: input.planId, isActive: true } }) : null
  if (input.planId && !plan) throw new CsmiError('That plan does not exist or is switched off.')
  try {
    return await db.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          name: input.name, slug: input.slug, status: 'TRIAL', ownerName: input.ownerName, ownerEmail: input.ownerEmail, ownerPhone: input.ownerPhone,
          settings: { create: { displayName: input.name } },
        },
        select: { id: true, slug: true },
      })
      if (plan) {
        const start = new Date(), end = new Date(start.getTime() + 14 * DAY)
        await tx.subscription.create({ data: { storeId: store.id, planId: plan.id, status: 'TRIALING', trialEndsAt: end, currentPeriodStart: start, currentPeriodEnd: end } })
      }
      return store
    })
  } catch (e) {
    if (isUnique(e)) throw new CsmiError('That store address is already used by another store.')
    throw e
  }
}

export async function setStoreStatus(storeId: string, input: StatusInput) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { id: true, status: true, name: true } })
  if (!store) throw new CsmiError('Store not found.')
  await db.store.update({
    where: { id: storeId },
    data: { status: input.status, suspendedAt: input.status === 'SUSPENDED' ? new Date() : null, ...(input.status === 'ACTIVE' ? { onboardedAt: new Date() } : {}) },
  })
  return { before: store.status, after: input.status, name: store.name }
}

// ------------------------------------------------------------ subscriptions
/**
 * Sets (or changes) a store's plan, price and state.
 * - Becoming ACTIVE, or changing monthly/yearly, starts a fresh billing period today.
 * - An ACTIVE subscription brings a trial/past-due store back to ACTIVE; PAST_DUE marks an active store past due.
 */
export async function saveSubscription(storeId: string, input: SubscriptionInput, now = new Date()) {
  return db.$transaction(async (tx) => {
    const [store, plan, current] = await Promise.all([
      tx.store.findUnique({ where: { id: storeId }, select: { id: true, status: true } }),
      tx.plan.findUnique({ where: { id: input.planId } }),
      tx.subscription.findUnique({ where: { storeId } }),
    ])
    if (!store) throw new CsmiError('Store not found.')
    if (!plan) throw new CsmiError('That plan does not exist.')
    if (!plan.isActive && current?.planId !== plan.id) throw new CsmiError('That plan is switched off. Choose another plan.')

    const oldInterval: BillingInterval | null = current ? intervalOf(current.currentPeriodStart, current.currentPeriodEnd) : null
    const restart = !current || (input.status === 'ACTIVE' && current.status !== 'ACTIVE') || (input.status === 'TRIALING' && current.status !== 'TRIALING') || (oldInterval !== null && oldInterval !== input.interval && input.status !== 'TRIALING')
    const start = restart ? now : current!.currentPeriodStart
    const trialEnd = new Date(now.getTime() + input.trialDays * DAY)
    const end = input.status === 'TRIALING' ? (restart ? trialEnd : current!.currentPeriodEnd) : restart ? addPeriod(start, input.interval) : current!.currentPeriodEnd

    const data = {
      planId: plan.id, status: input.status, priceOverride: input.priceOverride,
      currentPeriodStart: start, currentPeriodEnd: end,
      trialEndsAt: input.status === 'TRIALING' ? end : null,
      cancelledAt: input.status === 'CANCELLED' ? current?.cancelledAt ?? now : null,
    }
    await tx.subscription.upsert({ where: { storeId }, create: { storeId, ...data }, update: data })

    let storeStatus = store.status
    if (input.status === 'ACTIVE' && (store.status === 'TRIAL' || store.status === 'PAST_DUE')) storeStatus = 'ACTIVE'
    if (input.status === 'PAST_DUE' && store.status === 'ACTIVE') storeStatus = 'PAST_DUE'
    if (storeStatus !== store.status) await tx.store.update({ where: { id: storeId }, data: { status: storeStatus, ...(storeStatus === 'ACTIVE' ? { onboardedAt: now } : {}) } })
    return { storeStatus, planName: plan.name }
  })
}

// -------------------------------------------------------------------- plans
export async function savePlan(id: string | null, input: PlanInput) {
  const data = { name: input.name, monthlyPrice: input.monthlyPrice, yearlyPrice: input.yearlyPrice, isActive: input.isActive }
  try {
    if (id) {
      const r = await db.plan.updateMany({ where: { id }, data })
      if (r.count === 0) throw new CsmiError('Plan not found.')
      return id
    }
    return (await db.plan.create({ data, select: { id: true } })).id
  } catch (e) {
    if (isUnique(e)) throw new CsmiError('A plan with that name already exists.')
    throw e
  }
}

// -------------------------------------------------------------------- costs
async function assertStore(storeId: string | null) {
  if (storeId && !(await db.store.count({ where: { id: storeId } }))) throw new CsmiError('That store does not exist.')
}
export async function saveCost(id: string | null, input: CostFormInput) {
  await assertStore(input.storeId)
  const data = { name: input.name, category: input.category, monthlyAmount: input.monthlyAmount, storeId: input.storeId, isActive: input.isActive, note: input.note }
  if (id) {
    const r = await db.platformCost.updateMany({ where: { id }, data })
    if (r.count === 0) throw new CsmiError('Cost not found.')
    return id
  }
  return (await db.platformCost.create({ data, select: { id: true } })).id
}
export async function deleteCost(id: string) {
  const r = await db.platformCost.deleteMany({ where: { id } })
  if (r.count === 0) throw new CsmiError('Cost not found.')
}

export async function setServiceFee(key: string, fee: number) {
  const r = await db.serviceCatalog.updateMany({ where: { key }, data: { platformFee: fee } })
  if (r.count === 0) throw new CsmiError('Service not found.')
}

// ----------------------------------------------------------------- billing
/**
 * The store has no overdue invoices left: bring a past-due store back to ACTIVE.
 * Suspended and cancelled stores are never touched (that is the owner's decision).
 */
async function recoverIfSettled(tx: Tx, storeId: string, now: Date) {
  const overdue = await tx.invoice.count({ where: { storeId, status: { in: ['OPEN', 'OVERDUE'] }, dueDate: { lt: now } } })
  if (overdue > 0) return
  await tx.subscription.updateMany({ where: { storeId, status: 'PAST_DUE' }, data: { status: 'ACTIVE' } })
  await tx.store.updateMany({ where: { id: storeId, status: 'PAST_DUE' }, data: { status: 'ACTIVE' } })
}

export async function markInvoicePaid(invoiceId: string, method: string, reference: string | null, now = new Date()) {
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, storeId: true, number: true, total: true, status: true } })
    if (!inv) throw new CsmiError('Invoice not found.')
    const r = await tx.invoice.updateMany({ where: { id: inv.id, status: { in: ['DRAFT', 'OPEN', 'OVERDUE'] } }, data: { status: 'PAID', paidAt: now, paymentMethod: method, paymentRef: reference } })
    if (r.count === 0) throw new CsmiError(inv.status === 'PAID' ? 'This invoice is already marked as paid.' : 'This invoice was cancelled and cannot be paid.')
    await recoverIfSettled(tx, inv.storeId, now)
    return { storeId: inv.storeId, number: inv.number, total: num(inv.total) }
  })
}

export async function voidInvoice(invoiceId: string, now = new Date()) {
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, storeId: true, number: true, status: true } })
    if (!inv) throw new CsmiError('Invoice not found.')
    const r = await tx.invoice.updateMany({ where: { id: inv.id, status: { in: ['DRAFT', 'OPEN', 'OVERDUE'] } }, data: { status: 'VOID' } })
    if (r.count === 0) throw new CsmiError('Only unpaid invoices can be cancelled.')
    await recoverIfSettled(tx, inv.storeId, now)
    return { storeId: inv.storeId, number: inv.number }
  })
}

export interface BillingRun { invoicesCreated: number; periodsRolled: number; markedOverdue: number; skippedFree: number }

/**
 * "Run billing". Safe to press as often as you like (and later to call from a scheduled job):
 *  1. active subscriptions whose period ended move on to the next period,
 *  2. each gets exactly ONE invoice per period (existing ones are never duplicated),
 *  3. unpaid invoices past their due date become OVERDUE, and their store is marked PAST_DUE.
 * Nothing is ever suspended automatically: that stays your decision.
 */
export async function runBilling(now = new Date()): Promise<BillingRun> {
  const run: BillingRun = { invoicesCreated: 0, periodsRolled: 0, markedOverdue: 0, skippedFree: 0 }
  const subs = await db.subscription.findMany({
    where: { status: 'ACTIVE', store: { status: { in: ['ACTIVE', 'PAST_DUE'] } } },
    include: { plan: true, store: { select: { id: true, services: { where: { enabled: true }, select: { platformFee: true, service: { select: { name: true, platformFee: true } } } } } } },
  })
  const year = now.getUTCFullYear()
  let numbers = (await db.invoice.findMany({ where: { number: { startsWith: `INV-${year}-` } }, select: { number: true } })).map((i) => i.number)

  for (const sub of subs) {
    const interval = intervalOf(sub.currentPeriodStart, sub.currentPeriodEnd)
    let start = sub.currentPeriodStart, end = sub.currentPeriodEnd, rolled = false
    for (let guard = 0; end.getTime() <= now.getTime() && guard < 60; guard++) { start = end; end = addPeriod(start, interval); rolled = true }
    if (rolled) {
      await db.subscription.update({ where: { id: sub.id }, data: { currentPeriodStart: start, currentPeriodEnd: end } })
      run.periodsRolled++
    }

    if (await db.invoice.count({ where: { subscriptionId: sub.id, periodStart: start, status: { not: 'VOID' } } })) continue

    const price = periodPrice({ monthlyPrice: num(sub.plan.monthlyPrice), yearlyPrice: sub.plan.yearlyPrice ? num(sub.plan.yearlyPrice) : null }, interval, sub.priceOverride ? num(sub.priceOverride) : null)
    const addOns = sub.store.services.map((s) => ({ name: s.service.name, monthlyFee: s.platformFee ? num(s.platformFee) : num(s.service.platformFee) }))
    const lines = invoiceLines(sub.plan.name, price, interval, addOns)
    const totals = invoiceTotals(lines)
    if (totals.total <= 0) { run.skippedFree++; continue }

    for (let attempt = 0; attempt < 4; attempt++) {
      const number = nextInvoiceNumber(numbers, year)
      try {
        await db.invoice.create({
          data: {
            storeId: sub.storeId, subscriptionId: sub.id, number, status: 'OPEN', periodStart: start, periodEnd: end,
            subtotal: totals.subtotal, tax: totals.tax, total: totals.total, lineItems: lines as unknown as Prisma.InputJsonValue,
            dueDate: new Date(Math.max(start.getTime(), now.getTime()) + 7 * DAY),
          },
        })
        numbers = [...numbers, number]
        run.invoicesCreated++
        break
      } catch (e) {
        if (!isUnique(e) || attempt === 3) throw e
        // Someone else took this number a moment ago: read the real list again and try the next one.
        numbers = (await db.invoice.findMany({ where: { number: { startsWith: `INV-${year}-` } }, select: { number: true } })).map((i) => i.number)
      }
    }
  }

  // Overdue sweep.
  const flipped = await db.invoice.updateMany({ where: { status: 'OPEN', dueDate: { lt: now } }, data: { status: 'OVERDUE' } })
  run.markedOverdue = flipped.count
  const lateStores = (await db.invoice.findMany({ where: { status: 'OVERDUE' }, select: { storeId: true }, distinct: ['storeId'] })).map((i) => i.storeId)
  if (lateStores.length) {
    await db.subscription.updateMany({ where: { storeId: { in: lateStores }, status: 'ACTIVE' }, data: { status: 'PAST_DUE' } })
    await db.store.updateMany({ where: { id: { in: lateStores }, status: 'ACTIVE' }, data: { status: 'PAST_DUE' } })
  }
  return run
}
