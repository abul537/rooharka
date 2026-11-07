import { db } from '@/lib/db'
import { CsmiError } from '@/lib/csmi/manage'
import { serviceDef } from '@/lib/services/registry'
import { decisionMail, mailConfigured, sendMail } from '@/lib/mail'
import { getPlatformSettings } from '@/lib/signup/store'
import { cleanReason, decisionMessage, reasonProblem, whatsappLink, type DecisionSubject } from '@/lib/approvals/rules'

/** How the store owner was told: by email, or a ready WhatsApp link the owner can tap (when email is not set up). */
export interface Notice { emailed: boolean; whatsapp: string | null }

async function tell(o: { storeId: string; subject: DecisionSubject; what: string; heading: string; approved: boolean; reason: string }): Promise<Notice> {
  const [store, settings] = await Promise.all([
    db.store.findUnique({ where: { id: o.storeId }, select: { ownerName: true, ownerEmail: true, ownerPhone: true } }),
    getPlatformSettings(),
  ])
  if (!store) return { emailed: false, whatsapp: null }
  const contact = settings.supportEmail || settings.supportWhatsapp
  let emailed = false
  if (mailConfigured()) {
    emailed = (await sendMail(decisionMail({
      brand: settings.brandName, name: store.ownerName.split(' ')[0], to: store.ownerEmail, subject: `${o.heading} - ${settings.brandName}`,
      heading: o.heading, approved: o.approved, what: o.what, reason: o.reason, contact,
    }))).ok
  }
  const text = decisionMessage({ brand: settings.brandName, name: store.ownerName, subject: o.subject, what: o.what, approved: o.approved, reason: o.reason })
  return { emailed, whatsapp: emailed ? null : whatsappLink(store.ownerPhone, text) }
}

/** A refusal must carry a reason; an approval may carry an optional welcome note (kept short). */
function checkReason(approve: boolean, reason: string): string {
  if (!approve) { const p = reasonProblem(reason); if (p) throw new CsmiError(p) }
  return cleanReason(reason)
}

/**
 * Opens (approve) or closes (refuse) a store's shop to customers. Works from any state, so the owner can also
 * close a live shop later with a reason. Takes effect within 30 seconds (the store lookup is remembered that long).
 */
export async function decideShop(storeId: string, approve: boolean, reasonInput: string) {
  const reason = checkReason(approve, reasonInput)
  const store = await db.store.findUnique({ where: { id: storeId }, select: { name: true, shopApproval: true } })
  if (!store) throw new CsmiError('Store not found.')
  const next = approve ? 'APPROVED' : 'DENIED'
  await db.store.update({ where: { id: storeId }, data: { shopApproval: next, shopDecisionNote: approve ? null : reason, shopDecidedAt: new Date() } })
  const notice = await tell({ storeId, subject: 'shop', what: 'your shop going live', heading: approve ? 'Your shop is now open' : 'About your shop going live', approved: approve, reason })
  return { name: store.name, before: store.shopApproval, after: next as 'APPROVED' | 'DENIED', reason, notice }
}

/** Approves or blocks one service for one store. A blocked service stops working at once (see getServiceSecrets). */
export async function decideService(storeId: string, serviceKey: string, approve: boolean, reasonInput: string) {
  const def = serviceDef(serviceKey)
  if (!def) throw new CsmiError('Unknown service.')
  const reason = checkReason(approve, reasonInput)
  const next = approve ? 'APPROVED' : 'DENIED'
  const row = await db.storeService.findUnique({ where: { storeId_serviceKey: { storeId, serviceKey } }, select: { id: true, approval: true } })
  if (row) {
    await db.storeService.update({ where: { id: row.id }, data: { approval: next, decisionNote: approve ? null : reason, decidedAt: new Date(), ...(approve ? {} : { isDefault: false }) } })
  } else if (!approve) {
    // Block a service the store has not set up yet: it will be refused when they try (a row is made with the block on it).
    await db.serviceCatalog.upsert({ where: { key: def.key }, create: { key: def.key, name: def.name, type: def.type, description: def.description, requiresOwnCredentials: true }, update: {} })
    await db.storeService.create({ data: { storeId, serviceKey, enabled: false, approval: 'DENIED', decisionNote: reason, decidedAt: new Date() } })
  } else {
    throw new CsmiError('This store has not asked for that service.')
  }
  const notice = await tell({ storeId, subject: 'service', what: `the ${def.name} service`, heading: approve ? `${def.name} approved` : `About ${def.name}`, approved: approve, reason })
  return { serviceName: def.name, before: row?.approval ?? null, after: next as 'APPROVED' | 'DENIED', reason, notice }
}

/** Everything waiting for the owner, newest first, for the Approvals inbox. */
export async function loadPending() {
  const [signups, shops, services] = await Promise.all([
    db.signupRequest.findMany({ where: { status: 'PENDING_APPROVAL' }, orderBy: { createdAt: 'asc' }, take: 100 }),
    db.store.findMany({ where: { shopApproval: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 100, select: { id: true, name: true, slug: true, ownerName: true, ownerPhone: true, createdAt: true } }),
    db.storeService.findMany({ where: { approval: 'PENDING', enabled: true }, orderBy: { updatedAt: 'asc' }, take: 100, include: { store: { select: { id: true, name: true, ownerName: true } } } }),
  ])
  return { signups, shops, services }
}
