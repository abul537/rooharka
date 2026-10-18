'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import * as rules from '@/lib/admin/settings-rules'
import * as svc from '@/lib/admin/settings'
import type { ActionState } from '@/components/admin/ActionForm'

/** Same pipeline for every section: permission -> validate -> save -> audit -> refresh pages. */
async function run<T>(
  action: string,
  fd: FormData,
  parse: (g: FormData) => rules.Parsed<T>,
  save: (storeId: string, value: T) => Promise<unknown>,
  paths: string[],
  okMessage: string,
): Promise<ActionState> {
  const g = await adminOrError('settings.edit')
  if ('error' in g) return g
  const parsed = parse(fd)
  if (!parsed.ok) return { error: parsed.error }
  const value = parsed.value
  try {
    await save(g.admin.storeId, value)
  } catch (e) {
    console.error(`[settings ${action}]`, e)
    return { error: 'Could not save. Nothing was changed; please try again.' }
  }
  // Wallet numbers are not secrets, but keep them out of the log anyway.
  await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: `settings.${action}`, entity: 'StoreSettings', after: action === 'payments' ? { saved: true } : value })
  for (const p of paths) revalidatePath(p)
  return { ok: okMessage }
}

export const saveStoreInfoAction = (_: ActionState, fd: FormData) =>
  run('store', fd, rules.parseStoreInfo, svc.saveStoreInfo, ['/admin/settings'], 'Store details saved.')
export const savePaymentsAction = (_: ActionState, fd: FormData) =>
  run('payments', fd, rules.parsePaymentSettings, svc.savePayments, ['/admin/settings', '/checkout'], 'Payment and delivery rules saved. They apply to the next customer.')
export const saveFieldsAction = (_: ActionState, fd: FormData) =>
  run('checkout-fields', fd, rules.parseCheckoutFields, svc.saveCheckoutFields, ['/admin/settings', '/checkout'], 'Checkout form saved.')
export const saveTrackingAction = (_: ActionState, fd: FormData) =>
  run('tracking', fd, rules.parseTracking, svc.saveTracking, ['/admin/settings', '/track'], 'Tracking settings saved.')
export const saveProductPageAction = (_: ActionState, fd: FormData) =>
  run('product-page', fd, rules.parseProductPage, svc.saveProductPage, ['/admin/settings', '/product'], 'Product page saved.')
