'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { audit } from '@/lib/audit'
import { platformOrError } from '@/lib/csmi/guard'
import { CsmiError, createStore, deleteCost, markInvoicePaid, runBilling, saveCost, savePlan, saveSubscription, setServiceFee, setStoreStatus, voidInvoice } from '@/lib/csmi/manage'
import { parseCost, parseMarkPaid, parseNewStore, parsePlan, parseServiceFee, parseStoreStatus, parseSubscription } from '@/lib/csmi/forms'
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
  }, ['/csmi/plans'])
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
    const { key, fee } = must(parseServiceFee(fd))
    await setServiceFee(key, fee)
    return { message: 'Add-on fee saved. It is counted in revenue for stores that use this service.', entity: 'ServiceCatalog', entityId: key, after: { fee } }
  }, ['/csmi/services'])
}

export async function runBillingAction(_: ActionState): Promise<ActionState> {
  return manage('billing.run', async () => {
    const r = await runBilling()
    return {
      message: `Billing done: ${r.invoicesCreated} invoice(s) created, ${r.periodsRolled} period(s) moved on, ${r.markedOverdue} marked overdue${r.skippedFree ? `, ${r.skippedFree} free skipped` : ''}.`,
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
