import { randomBytes, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { startOfPktDay } from '@/lib/admin/dates'
import { hashPassword } from '@/lib/auth/password'
import { createSession } from '@/lib/auth/session'
import { addPeriod } from '@/lib/csmi/rules'
import { CsmiError } from '@/lib/csmi/manage'
import { CHECKOUT_FIELD_DEFAULTS } from '@/lib/store-defaults'
import { alreadyRegisteredMail, approvedMail, rejectedMail, sendMail, verifyEmailMail, mailConfigured } from '@/lib/mail'
import { storeAddress } from '@/lib/platform-host'
import { rateLimit } from '@/lib/rate-limit'
import { REQUEST_HOURS, TERMS_VERSION, hashToken, needsApproval, newVerifyToken, requestExpiry, signupGate, splitVerifyToken, trialEnd, type SignupInput } from '@/lib/signup/rules'
import { getPlatformSettings } from '@/lib/signup/store'
import type { PlatformSettings } from '@/lib/signup/settings'

/** A problem whose message is safe to show to the person signing up (or the owner in CSMI). */
export class SignupError extends CsmiError {}

const isUnique = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'
const APPROVAL_WAIT_DAYS = 30
const BAD_LINK = 'This link is not valid, or it has already been used. If you already confirmed, just sign in.'

export interface Meta { ip: string; userAgent?: string; origin: string }

// ================================================================== step 1: sign up
/**
 * Saves a sign-up request. Nothing but the request exists until the email is confirmed (and approved, if the owner wants):
 * no store, no login, so nobody can squat a store address or someone else's email.
 * Whether or not the email already has an account, the visitor sees the same answer (no way to discover who is registered).
 */
export async function startSignup(input: SignupInput, meta: Meta): Promise<{ next: 'check-email' | 'pending' }> {
  const settings = await getPlatformSettings()
  const now = new Date()
  const mail = mailConfigured()

  const [, startedToday] = await Promise.all([
    db.signupRequest.updateMany({ where: { status: 'PENDING_EMAIL', expiresAt: { lt: now } }, data: { status: 'EXPIRED', tokenHash: null } }),
    db.signupRequest.count({ where: { createdAt: { gte: startOfPktDay(0, now) } } }),
  ])
  const gate = signupGate(settings, startedToday)
  if (!gate.ok) throw new SignupError(gate.error)
  if (!rateLimit(`signup-ip:${meta.ip}`, 5, 3_600_000).ok || !rateLimit(`signup-email:${input.email}`, 3, 3_600_000).ok) throw new SignupError('Too many attempts. Please wait an hour and try again.')

  const plan = await db.plan.findFirst({ where: { id: input.planId, isActive: true }, select: { id: true, yearlyPrice: true } })
  if (!plan) throw new SignupError('That plan is no longer available. Please choose another.')
  if (input.interval === 'YEARLY' && !plan.yearlyPrice) throw new SignupError('That plan is only sold monthly.')

  // The same person trying again replaces their own earlier, unfinished request.
  await db.signupRequest.updateMany({ where: { email: input.email, status: { in: ['PENDING_EMAIL', 'PENDING_APPROVAL'] } }, data: { status: 'EXPIRED', tokenHash: null } })

  const [storeTaken, requestTaken] = await Promise.all([
    db.store.findUnique({ where: { slug: input.slug }, select: { id: true } }),
    db.signupRequest.findFirst({ where: { slug: input.slug, status: { in: ['PENDING_EMAIL', 'PENDING_APPROVAL'] } }, select: { id: true } }),
  ])
  if (storeTaken || requestTaken) throw new SignupError('That store address is already taken. Please choose another.')

  const known = (await db.user.findUnique({ where: { email: input.email }, select: { id: true } })) ?? (await db.store.findFirst({ where: { ownerEmail: input.email, status: { not: 'CANCELLED' } }, select: { id: true } }))
  if (known) {
    if (mail) await sendMail(alreadyRegisteredMail({ brand: settings.brandName, to: input.email, loginUrl: `${meta.origin}/admin/login` }))
    return { next: mail ? 'check-email' : 'pending' }
  }

  const id = `sr${randomBytes(12).toString('hex')}`
  const verify = mail ? newVerifyToken(id) : null
  await db.signupRequest.create({
    data: {
      id, email: input.email, ownerName: input.ownerName, phone: input.phone, storeName: input.storeName, slug: input.slug, planId: plan.id, interval: input.interval,
      passwordHash: await hashPassword(input.password), tokenHash: verify?.hash ?? null,
      status: mail ? 'PENDING_EMAIL' : 'PENDING_APPROVAL', termsVersion: TERMS_VERSION, ip: meta.ip.slice(0, 64), userAgent: meta.userAgent?.slice(0, 255),
      expiresAt: mail ? requestExpiry(now) : new Date(now.getTime() + APPROVAL_WAIT_DAYS * 86_400_000),
    },
  })

  if (verify) {
    const sent = await sendMail(verifyEmailMail({ brand: settings.brandName, name: input.ownerName.split(' ')[0], to: input.email, hours: REQUEST_HOURS, link: `${meta.origin}/signup/verify?token=${encodeURIComponent(verify.token)}` }))
    if (!sent.ok) {
      // Never leave the person waiting for an email that is not coming.
      console.error('[signup] verification email failed:', sent.error)
      await db.signupRequest.update({ where: { id }, data: { status: 'EXPIRED', tokenHash: null } })
      throw new SignupError('We could not send the confirmation email right now. Please try again in a few minutes.')
    }
  }
  return { next: mail ? 'check-email' : 'pending' }
}

// ============================================================ step 2: confirm email
/** Read-only look at a link, so the page can show "Confirm" (email scanners that open links cannot use it up). */
export async function peekVerifyLink(token: string): Promise<{ ok: true; storeName: string; email: string } | { ok: false; error: string }> {
  const t = splitVerifyToken(token)
  if (!t) return { ok: false, error: BAD_LINK }
  const req = await db.signupRequest.findUnique({ where: { id: t.id }, select: { tokenHash: true, status: true, expiresAt: true, storeName: true, email: true } })
  if (!req || !safeEqual(req.tokenHash, hashToken(t.secret)) || req.status !== 'PENDING_EMAIL') return { ok: false, error: BAD_LINK }
  if (req.expiresAt < new Date()) return { ok: false, error: 'This link has expired. Please sign up again.' }
  return { ok: true, storeName: req.storeName, email: req.email }
}

const safeEqual = (a: string | null, b: string) => !!a && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

/** The person pressed "Confirm". Creates the store and signs them in, or queues the request for the owner's approval. */
export async function confirmSignup(token: string, meta: Pick<Meta, 'ip' | 'userAgent'>): Promise<{ state: 'ready' } | { state: 'pending' }> {
  const t = splitVerifyToken(token)
  if (!t) throw new SignupError(BAD_LINK)
  const req = await db.signupRequest.findUnique({ where: { id: t.id } })
  if (!req || !safeEqual(req.tokenHash, hashToken(t.secret)) || req.status !== 'PENDING_EMAIL') throw new SignupError(BAD_LINK)
  const now = new Date()
  if (req.expiresAt < now) throw new SignupError('This link has expired. Please sign up again.')

  const settings = await getPlatformSettings()
  if (needsApproval(true, settings.requireApproval)) {
    const claimed = await db.signupRequest.updateMany({
      where: { id: req.id, status: 'PENDING_EMAIL' },
      data: { status: 'PENDING_APPROVAL', emailVerified: true, verifiedAt: now, tokenHash: null, expiresAt: new Date(now.getTime() + APPROVAL_WAIT_DAYS * 86_400_000) },
    })
    if (claimed.count !== 1) throw new SignupError(BAD_LINK)
    return { state: 'pending' }
  }

  const done = await provision(req.id, 'PENDING_EMAIL', settings, now)
  await createSession(done.userId, { ip: meta.ip, userAgent: meta.userAgent })
  return { state: 'ready' }
}

// ================================================================== provisioning
/**
 * Turns a request into a real store, all or nothing: the store, its settings, checkout form, trial subscription and the
 * owner's login are created in ONE transaction, and the request is claimed in the same step, so pressing twice or two
 * servers racing can never create two stores. Any problem (address taken meanwhile, email registered meanwhile, plan
 * switched off) rolls everything back and the request stays as it was.
 */
async function provision(requestId: string, from: 'PENDING_EMAIL' | 'PENDING_APPROVAL', settings: PlatformSettings, now: Date) {
  try {
    return await db.$transaction(async (tx) => {
      const claimed = await tx.signupRequest.updateMany({
        where: { id: requestId, status: from },
        data: { status: 'COMPLETED', decidedAt: now, tokenHash: null, ...(from === 'PENDING_EMAIL' ? { emailVerified: true, verifiedAt: now } : {}) },
      })
      if (claimed.count !== 1) throw new SignupError('This sign-up was already handled.')
      const req = await tx.signupRequest.findUniqueOrThrow({ where: { id: requestId } })
      const plan = await tx.plan.findFirst({ where: { id: req.planId, isActive: true } })
      if (!plan) throw new SignupError('The plan chosen is no longer offered. Ask the person to choose another plan.')

      const days = settings.trialDays
      const interval = req.interval === 'YEARLY' ? 'YEARLY' : 'MONTHLY'
      const end = days > 0 ? trialEnd(now, days) : addPeriod(now, interval)
      const store = await tx.store.create({
        data: {
          name: req.storeName, slug: req.slug, status: days > 0 ? 'TRIAL' : 'ACTIVE', ownerName: req.ownerName, ownerEmail: req.email, ownerPhone: req.phone,
          onboardedAt: days > 0 ? null : now,
          settings: { create: { displayName: req.storeName, supportEmail: req.email } },
          checkoutFields: { create: CHECKOUT_FIELD_DEFAULTS.map((f, i) => ({ ...f, sortOrder: i, enabled: true })) },
          subscription: { create: { planId: plan.id, status: days > 0 ? 'TRIALING' : 'ACTIVE', trialEndsAt: days > 0 ? end : null, currentPeriodStart: now, currentPeriodEnd: end } },
        },
        select: { id: true, slug: true },
      })
      const user = await tx.user.create({ data: { storeId: store.id, email: req.email, name: req.ownerName, role: 'STORE_OWNER', passwordHash: req.passwordHash }, select: { id: true } })
      await tx.signupRequest.update({ where: { id: requestId }, data: { storeId: store.id } })
      return { storeId: store.id, userId: user.id, slug: store.slug, email: req.email, name: req.ownerName }
    }).then(async (r) => {
      await audit({ storeId: r.storeId, userId: r.userId, action: 'signup.completed', entity: 'Store', entityId: r.storeId, after: { slug: r.slug, via: from === 'PENDING_EMAIL' ? 'email' : 'approval' } })
      return r
    })
  } catch (e) {
    if (isUnique(e)) {
      const target = JSON.stringify((e as { meta?: unknown }).meta ?? '')
      throw new SignupError(/email/i.test(target) ? 'An account with this email already exists.' : 'That store address was taken a moment ago. Please sign up again with another address.')
    }
    throw e
  }
}

// ================================================================ owner decisions
export async function approveSignup(requestId: string, origin: string) {
  const settings = await getPlatformSettings()
  const r = await provision(requestId, 'PENDING_APPROVAL', settings, new Date())
  let notified = false
  if (mailConfigured()) {
    const sent = await sendMail(approvedMail({ brand: settings.brandName, name: r.name.split(' ')[0], to: r.email, loginUrl: `${origin}/admin/login`, shopUrl: storeAddress(r.slug) ?? `${origin} (ask us for your shop address)` }))
    notified = sent.ok
  }
  return { ...r, notified }
}

export async function rejectSignup(requestId: string, reason: string) {
  const note = reason.trim().slice(0, 200)
  const settings = await getPlatformSettings()
  const res = await db.signupRequest.updateMany({ where: { id: requestId, status: 'PENDING_APPROVAL' }, data: { status: 'REJECTED', decidedAt: new Date(), decisionNote: note || null, tokenHash: null } })
  if (res.count !== 1) throw new SignupError('This request is no longer waiting for a decision.')
  const req = await db.signupRequest.findUniqueOrThrow({ where: { id: requestId }, select: { email: true, ownerName: true, storeName: true } })
  let notified = false
  if (mailConfigured()) notified = (await sendMail(rejectedMail({ brand: settings.brandName, name: req.ownerName.split(' ')[0], to: req.email, reason: note, contact: settings.supportEmail || settings.supportWhatsapp }))).ok
  return { ...req, notified }
}

/** Is this store address free right now? (Public yes/no, used by the form as people type.) */
export async function slugAvailable(slug: string): Promise<boolean> {
  const [store, req] = await Promise.all([
    db.store.findUnique({ where: { slug }, select: { id: true } }),
    db.signupRequest.findFirst({ where: { slug, status: { in: ['PENDING_EMAIL', 'PENDING_APPROVAL'] }, expiresAt: { gt: new Date() } }, select: { id: true } }),
  ])
  return !store && !req
}
