'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { audit } from '@/lib/audit'
import { runJob } from '@/lib/jobs'
import { platformOrError } from '@/lib/csmi/guard'
import { CsmiError, addDomain, createStore, removeDomain, setDomainLive, deleteCost, markInvoicePaid, runBilling, saveCost, savePlan, saveSubscription, setServiceFee, setStoreStatus, voidInvoice } from '@/lib/csmi/manage'
import { parseCost, parseMarkPaid, parseNewStore, parsePlan, parseServiceFee, parseStoreStatus, parseSubscription } from '@/lib/csmi/forms'
import { parseDomainInput } from '@/lib/domains'
import { lookupDomain } from '@/lib/dns-check'
import { normalizeHost } from '@/lib/domains'
import { platformOrigin } from '@/lib/platform-host'
import { parseSettingsForm } from '@/lib/signup/settings'
import { savePlatformSettings } from '@/lib/signup/store'
import { approveSignup, rejectSignup } from '@/lib/signup/service'
import { decideService, decideShop } from '@/lib/approvals/service'
import { parseOffer } from '@/lib/offers/rules'
import { saveOffer } from '@/lib/offers/service'
import type { Parsed } from '@/lib/admin/settings-rules'
import type { ActionState } from '@/components/admin/ActionForm'

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '')
const must = <T,>(p: Parsed<T>): T => { if (!p.ok) throw new CsmiError(p.error); return p.value }

interface Done { message: string; storeId?: string | null; entity: string; entityId?: string; after?: unknown }

/** Same pipeline for every CSMI action: owner permission -> work -> audit -> refresh. Money and stores need `csmi.manage`. */
async function manage(action: string, work: () => Promise<Done>, paths: string[] = ['/csmi']): Promise<ActionState> {
  const g = await platformOrError('csmi.manage')
  if ('error' in g) return g
  try {
    const d = await work()
    await audit({ storeId: d.storeId ?? null, userId: g.user.id, action: `csmi.${action}`, entity: d.entity, entityId: d.entityId, after: d.after })
    for (const p of ['/csmi', ...paths]) revalidatePath(p)
    return { ok: d.message }
  } catch (e) {
    if (e instanceof CsmiError) return { error: e.message }
    console.error(`[csmi ${action}]`, e)
    return { error: 'Something went wrong. Nothing was changed; please try again.' }
  }
}

export async function createStoreAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await platformOrError('csmi.manage'); if ('error' in g) return g
  let id: string
  try {
    const input = must(parseNewStore(fd))
    const store = await createStore(input)
    id = store.id
    await audit({ storeId: store.id, userId: g.user.id, action: 'csmi.store.create', entity: 'Store', entityId: store.id, after: { slug: store.slug } })
  } catch (e) {
    if (e instanceof CsmiError) return { error: e.message }
    console.error('[csmi store create]', e)
    return { error: 'Something went wrong. Nothing was changed; please try again.' }
  }
  revalidatePath('/csmi'); revalidatePath('/csmi/stores')
  redirect(`/csmi/stores/${id}`)
}

export async function setStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const storeId = str(fd, 'storeId')
  return manage('store.status', async () => {
    const r = await setStoreStatus(storeId, must(parseStoreStatus(fd)))
    return { message: `${r.name} is now ${r.after.replace('_', ' ').toLowerCase()}.${r.after === 'SUSPENDED' ? ' Its shop closes to customers within 30 seconds.' : ''}`, storeId, entity: 'Store', entityId: storeId, after: { from: r.before, to: r.after, reason: str(fd, 'reason').slice(0, 200) } }
  }, ['/csmi/stores', `/csmi/stores/${storeId}`])
}

export async function saveSubscriptionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const storeId = str(fd, 'storeId')
  return manage('subscription.save', async () => {
    const input = must(parseSubscription(fd))
    const r = await saveSubscription(storeId, input)
    return { message: `Subscription saved: ${r.planName}.`, storeId, entity: 'Subscription', entityId: storeId, after: input }
  }, ['/csmi/stores', `/csmi/stores/${storeId}`])
}

export async function savePlanAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, 'planId') || null
  return manage('plan.save', async () => {
    const input = must(parsePlan(fd))
    const saved = await savePlan(id, input)
    return { message: id ? 'Plan saved.' : 'Plan added.', entity: 'Plan', entityId: saved, after: input }
  }, ['/csmi/plans', '/pricing', '/platform', '/signup'])
}

export async function saveCostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, 'costId') || null
  return manage('cost.save', async () => {
    const input = must(parseCost(fd))
    const saved = await saveCost(id, input)
    return { message: id ? 'Cost saved.' : 'Cost added.', storeId: input.storeId, entity: 'PlatformCost', entityId: saved, after: input }
  }, ['/csmi/costs'])
}

export async function deleteCostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, 'costId')
  return manage('cost.delete', async () => { await deleteCost(id); return { message: 'Cost deleted.', entity: 'PlatformCost', entityId: id } }, ['/csmi/costs'])
}

export async function setServiceFeeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return manage('service.fee', async () => {
    const { key, fee, requiresApproval } = must(parseServiceFee(fd))
    await setServiceFee(key, fee, requiresApproval)
    return { message: `Saved. ${requiresApproval ? 'Stores must ask you before using this service.' : 'Stores can switch this service on themselves.'} The fee is counted in revenue for stores that use it.`, entity: 'ServiceCatalog', entityId: key, after: { fee, requiresApproval } }
  }, ['/csmi/services'])
}

export async function runBillingAction(_: ActionState): Promise<ActionState> {
  return manage('billing.run', async () => {
    const o = await runJob('billing', 'manual', () => runBilling())
    if (o.status === 'busy') throw new CsmiError('Billing is already running (started a moment ago). Please wait a minute and refresh.')
    if (o.status === 'failed') throw new CsmiError(`Billing stopped with a problem: ${o.error}`)
    const r = o.result
    return {
      message: `Billing done: ${r.invoicesCreated} invoice(s) created, ${r.trialsConverted} trial(s) ended and moved to paid, ${r.periodsRolled} period(s) moved on, ${r.markedOverdue} marked overdue${r.skippedFree ? `, ${r.skippedFree} free skipped` : ''}${r.failed ? `. ${r.failed} store(s) could not be billed: check the server log and run billing again` : ''}.`,
      entity: 'Invoice', after: r,
    }
  }, ['/csmi/billing', '/csmi/stores'])
}

export async function markPaidAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, 'invoiceId')
  return manage('invoice.paid', async () => {
    const p = must(parseMarkPaid(fd))
    const r = await markInvoicePaid(id, p.method, p.reference)
    return { message: `Invoice ${r.number} marked as paid.`, storeId: r.storeId, entity: 'Invoice', entityId: id, after: { method: p.method, total: r.total } }
  }, ['/csmi/billing', '/csmi/stores'])
}

export async function voidInvoiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, 'invoiceId')
  return manage('invoice.void', async () => {
    const r = await voidInvoice(id)
    return { message: `Invoice ${r.number} cancelled.`, storeId: r.storeId, entity: 'Invoice', entityId: id }
  }, ['/csmi/billing', '/csmi/stores'])
}

// ------------------------------------------------------------ web addresses
export async function addDomainAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const storeId = str(fd, 'storeId')
  return manage('domain.add', async () => {
    const p = parseDomainInput(str(fd, 'host'))
    if (!p.ok) throw new CsmiError(p.error)
    const d = await addDomain(storeId, p.host)
    return { message: `${d.host} added. It is OFF until you point it at the platform and switch it live.`, storeId, entity: 'StoreDomain', entityId: d.id, after: { host: d.host } }
  }, [`/csmi/stores/${storeId}`])
}

export async function setDomainLiveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const storeId = str(fd, 'storeId'), id = str(fd, 'domainId'), live = str(fd, 'live') === '1'
  return manage('domain.live', async () => {
    await setDomainLive(storeId, id, live)
    return { message: live ? 'Live. Customers can now reach the shop on this address (within 30 seconds).' : 'Switched off. The address no longer opens the shop (within 30 seconds).', storeId, entity: 'StoreDomain', entityId: id, after: { live } }
  }, [`/csmi/stores/${storeId}`])
}

export async function removeDomainAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const storeId = str(fd, 'storeId'), id = str(fd, 'domainId')
  return manage('domain.remove', async () => {
    const host = await removeDomain(storeId, id)
    return { message: `${host} removed.`, storeId, entity: 'StoreDomain', entityId: id, after: { host } }
  }, [`/csmi/stores/${storeId}`])
}

/** Read-only: shows where the address points. View permission is enough. */
export async function checkDomainAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await platformOrError('csmi.view'); if ('error' in g) return g
  const p = parseDomainInput(str(fd, 'host'))
  if (!p.ok) return { error: p.error }
  const r = await lookupDomain(p.host)
  if (!r.cname.length && !r.a.length) return { error: `${p.host} does not point anywhere yet (or DNS has not updated). DNS changes can take from a few minutes to a day.` }
  return { ok: `${p.host} points to: ${[...r.cname.map((c) => `CNAME ${c}`), ...r.a.map((a) => `A ${a}`)].join(', ')}. Compare this with what your hosting company asks for.` }
}

// ---------------------------------------------------------------- sign-ups
export async function saveSignupSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return manage('signup.settings', async () => {
    const v = must(parseSettingsForm(fd))
    await savePlatformSettings(v)
    return { message: v.signupsOpen ? 'Saved. Sign-ups are OPEN: the public site accepts new stores.' : 'Saved. Sign-ups are CLOSED: the public site shows a "closed" notice.', entity: 'PlatformSetting', entityId: 'platform', after: { signupsOpen: v.signupsOpen, requireApproval: v.requireApproval, trialDays: v.trialDays, dailyCap: v.dailyCap } }
  }, ['/csmi/signup', '/csmi/approvals'])
}

export async function approveSignupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, 'requestId')
  const origin = platformOrigin(normalizeHost((await headers()).get('host')))
  return manage('signup.approve', async () => {
    const r = await approveSignup(id, origin)
    return { message: `${r.name}'s store was created and is on its free trial. ${r.notified ? 'We emailed them.' : 'Email was not sent: tell them yourself that they can sign in at /admin/login with the email and password they chose.'}`, storeId: r.storeId, entity: 'SignupRequest', entityId: id, after: { slug: r.slug } }
  }, ['/csmi/signup', '/csmi/approvals', '/csmi/stores'])
}

export async function rejectSignupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, 'requestId')
  return manage('signup.reject', async () => {
    const r = await rejectSignup(id, str(fd, 'reason'))
    return { message: `Request from ${r.ownerName} rejected. ${r.notified ? 'We emailed them.' : 'Email was not sent: tell them yourself if you want them to know.'}`, entity: 'SignupRequest', entityId: id, after: { reason: str(fd, 'reason').slice(0, 200) } }
  }, ['/csmi/signup', '/csmi/approvals'])
}

// ---------------------------------------------------------------- approvals (shop go-live, services)
const notified = (n: { emailed: boolean; whatsapp: string | null }) =>
  n.emailed ? ' We emailed the store owner.' : n.whatsapp ? ' Email is not set up: open "Recently decided" below to send them the message on WhatsApp.' : ' Email is not set up and there is no phone number: tell them yourself.'

export async function decideShopAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const storeId = str(fd, 'storeId'); const approve = str(fd, 'decision') === 'approve'
  return manage('shop.decide', async () => {
    const r = await decideShop(storeId, approve, str(fd, 'reason'))
    return { message: `${r.name}'s shop is now ${approve ? 'OPEN to customers' : 'CLOSED to customers'} (within 30 seconds).${notified(r.notice)}`, storeId, entity: 'Store', entityId: storeId, after: { shop: r.after, reason: r.reason } }
  }, ['/csmi/approvals', '/csmi/stores', `/csmi/stores/${storeId}`])
}

export async function decideServiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const storeId = str(fd, 'storeId'); const key = str(fd, 'serviceKey'); const approve = str(fd, 'decision') === 'approve'
  return manage('service.decide', async () => {
    const r = await decideService(storeId, key, approve, str(fd, 'reason'))
    return { message: `${r.serviceName} is now ${approve ? 'APPROVED' : 'BLOCKED'} for this store.${notified(r.notice)}`, storeId, entity: 'StoreService', entityId: key, after: { service: key, approval: r.after, reason: r.reason } }
  }, ['/csmi/approvals', `/csmi/stores/${storeId}`])
}

// ---------------------------------------------------------------- offers
export async function saveOfferAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, 'offerId') || null
  return manage('offer.save', async () => {
    const input = must(parseOffer(fd))
    const saved = await saveOffer(id, input)
    return { message: id ? `Offer ${input.code} saved.` : `Offer ${input.code} created. Share the link /signup?offer=${input.code}`, entity: 'Offer', entityId: saved, after: input }
  }, ['/csmi/offers'])
}
