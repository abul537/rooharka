import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import type { CostFormInput, NewStoreInput, PlanInput, StatusInput, SubscriptionInput } from '@/lib/csmi/forms'
import { MAX_DOMAINS_PER_STORE } from '@/lib/domains'
import { applyDiscount } from '@/lib/offers/rules'
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

// ------------------------------------------------------------ web addresses
/** Adds a web address to a store. It starts switched OFF (not live) until the owner has pointed the domain at the platform. */
export async function addDomain(storeId: string, host: string) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { id: true, _count: { select: { domains: true } } } })
  if (!store) throw new CsmiError('Store not found.')
  if (store._count.domains >= MAX_DOMAINS_PER_STORE) throw new CsmiError(`A store can have at most ${MAX_DOMAINS_PER_STORE} web addresses.`)
  try {
    return await db.storeDomain.create({ data: { storeId, host, isPrimary: store._count.domains === 0 }, select: { id: true, host: true } })
  } catch (e) {
    if (isUnique(e)) throw new CsmiError('That web address is already used by a store.')
    throw e
  }
}

/** Switches an address live (customers reach the shop on it) or off. Scoped to the store, so an id from another store cannot be touched. */
export async function setDomainLive(storeId: string, domainId: string, live: boolean) {
  const r = await db.storeDomain.updateMany({ where: { id: domainId, storeId }, data: { verifiedAt: live ? new Date() : null } })
  if (r.count === 0) throw new CsmiError('Web address not found.')
}

export async function removeDomain(storeId: string, domainId: string) {
  const row = await db.storeDomain.findFirst({ where: { id: domainId, storeId }, select: { id: true, host: true, isPrimary: true } })
  if (!row) throw new CsmiError('Web address not found.')
  await db.$transaction(async (tx) => {
    await tx.storeDomain.delete({ where: { id: row.id } })
    if (row.isPrimary) { // keep one primary if any address is left
      const next = await tx.storeDomain.findFirst({ where: { storeId }, orderBy: { createdAt: 'asc' }, select: { id: true } })
      if (next) await tx.storeDomain.update({ where: { id: next.id }, data: { isPrimary: true } })
    }
  })
  return row.host
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
  const { products, ordersPerMonth, staff, tagline, popular } = input.show
  const limits = { ...(products ? { products } : {}), ...(ordersPerMonth ? { ordersPerMonth } : {}), ...(staff ? { staff } : {}), ...(tagline ? { tagline } : {}), ...(popular ? { popular: true } : {}) }
  const data = { name: input.name, monthlyPrice: input.monthlyPrice, yearlyPrice: input.yearlyPrice, isActive: input.isActive, isPublic: input.isPublic, sortOrder: input.sortOrder, features: input.features as Prisma.InputJsonValue, limits: limits as Prisma.InputJsonValue }
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

export async function setServiceFee(key: string, fee: number, requiresApproval: boolean) {
  const r = await db.serviceCatalog.updateMany({ where: { key }, data: { platformFee: fee, requiresApproval } })
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

/**
 * Trials that have run out become paying subscriptions: a fresh billing period starts today (monthly, or yearly if the
 * store chose that when signing up) and the normal pass below creates its first invoice. Nothing is suspended: an unpaid
 * invoice only turns the store "past due", and suspending stays the owner's decision.
 */
async function convertEndedTrials(now: Date): Promise<number> {
  const ended = await db.subscription.findMany({ where: { status: 'TRIALING', trialEndsAt: { lte: now }, store: { status: { in: ['TRIAL', 'ACTIVE'] } } }, select: { id: true, storeId: true } })
  if (!ended.length) return 0
  const chosen = new Map((await db.signupRequest.findMany({ where: { storeId: { in: ended.map((e) => e.storeId) }, status: 'COMPLETED' }, select: { storeId: true, interval: true } })).map((r) => [r.storeId, r.interval]))
  let n = 0
  for (const s of ended) {
    const interval: BillingInterval = chosen.get(s.storeId) === 'YEARLY' ? 'YEARLY' : 'MONTHLY'
    const claimed = await db.subscription.updateMany({ where: { id: s.id, status: 'TRIALING' }, data: { status: 'ACTIVE', trialEndsAt: null, currentPeriodStart: now, currentPeriodEnd: addPeriod(now, interval) } })
    if (claimed.count === 1) { await db.store.updateMany({ where: { id: s.storeId, status: 'TRIAL' }, data: { status: 'ACTIVE', onboardedAt: now } }); n++ }
  }
  return n
}

export interface BillingRun { invoicesCreated: number; periodsRolled: number; markedOverdue: number; skippedFree: number; failed: number; trialsConverted: number }

/**
 * "Run billing". Safe to press as often as you like (and later to call from a scheduled job):
 *  1. active subscriptions whose period ended move on to the next period,
 *  2. each gets exactly ONE invoice per period (existing ones are never duplicated),
 *  3. unpaid invoices past their due date become OVERDUE, and their store is marked PAST_DUE.
 * Nothing is ever suspended automatically: that stays your decision.
 */
export async function runBilling(now = new Date()): Promise<BillingRun> {
  const run: BillingRun = { invoicesCreated: 0, periodsRolled: 0, markedOverdue: 0, skippedFree: 0, failed: 0, trialsConverted: 0 }
  run.trialsConverted = await convertEndedTrials(now)
  const subs = await db.subscription.findMany({
    where: { status: 'ACTIVE', store: { status: { in: ['ACTIVE', 'PAST_DUE'] } } },
    include: { plan: true, store: { select: { id: true, services: { where: { enabled: true, approval: 'APPROVED' }, select: { platformFee: true, service: { select: { name: true, platformFee: true } } } } } } },
  })
  const year = now.getUTCFullYear()
  let numbers = (await db.invoice.findMany({ where: { number: { startsWith: `INV-${year}-` } }, select: { number: true } })).map((i) => i.number)

  // One store's problem must never stop everyone else's invoice: each store is billed on its own and failures are counted.
  const billOne = async (sub: (typeof subs)[number]) => {
    const interval = intervalOf(sub.currentPeriodStart, sub.currentPeriodEnd)
    let start = sub.currentPeriodStart, end = sub.currentPeriodEnd, rolled = false
    for (let guard = 0; end.getTime() <= now.getTime() && guard < 60; guard++) { start = end; end = addPeriod(start, interval); rolled = true }
    if (rolled) {
      await db.subscription.update({ where: { id: sub.id }, data: { currentPeriodStart: start, currentPeriodEnd: end } })
      run.periodsRolled++
    }

    if (await db.invoice.count({ where: { subscriptionId: sub.id, periodStart: start, status: { not: 'VOID' } } })) return

    const price = periodPrice({ monthlyPrice: num(sub.plan.monthlyPrice), yearlyPrice: sub.plan.yearlyPrice ? num(sub.plan.yearlyPrice) : null }, interval, sub.priceOverride ? num(sub.priceOverride) : null)
    const addOns = sub.store.services.map((s) => ({ name: s.service.name, monthlyFee: s.platformFee ? num(s.platformFee) : num(s.service.platformFee) }))
    const discounted = sub.discountPercent > 0 && sub.discountPeriodsLeft > 0
    const lines = discounted ? applyDiscount(invoiceLines(sub.plan.name, price, interval, addOns), sub.discountPercent, sub.offerCode ?? 'Offer') : invoiceLines(sub.plan.name, price, interval, addOns)
    const totals = invoiceTotals(lines)
    // One discounted period is used up per billed period, even when the discount made the invoice free.
    const usePeriod = () => discounted ? db.subscription.updateMany({ where: { id: sub.id, discountPeriodsLeft: { gt: 0 } }, data: { discountPeriodsLeft: { decrement: 1 } } }) : null
    if (totals.total <= 0) { await usePeriod(); run.skippedFree++; return }

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
        await usePeriod()
        run.invoicesCreated++
        break
      } catch (e) {
        if (!isUnique(e) || attempt === 3) throw e
        // Someone else took this number a moment ago: read the real list again and try the next one.
        numbers = (await db.invoice.findMany({ where: { number: { startsWith: `INV-${year}-` } }, select: { number: true } })).map((i) => i.number)
      }
    }
  }
  for (const sub of subs) {
    try { await billOne(sub) } catch (e) { run.failed++; console.error('[billing] store failed', sub.storeId, e) }
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

// ------------------------------------------------------- what a store may use
/** Sets the platform owner's overrides for one store: its staff limit (null = follow the plan) and POS lite (PLAN / ON / OFF). */
export async function setStoreEntitlements(storeId: string, input: { staffLimit: number | null; posMode: 'PLAN' | 'ON' | 'OFF' }) {
  const before = await db.store.findUnique({ where: { id: storeId }, select: { name: true, staffLimit: true, posMode: true } })
  if (!before) throw new CsmiError('Store not found.')
  await db.store.update({ where: { id: storeId }, data: { staffLimit: input.staffLimit, posMode: input.posMode } })
  return { name: before.name, before: { staffLimit: before.staffLimit, posMode: before.posMode } }
}
