'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import * as rules from '@/lib/admin/settings-rules'
import * as svc from '@/lib/admin/settings'
import { parseCourierForm } from '@/lib/couriers/config'
import { saveCourierConfig } from '@/lib/couriers/store'
import { parseOtpSettings, resolveProvider } from '@/lib/otp/rules'
import { saveOtpSettings, sendTestMessage } from '@/lib/otp/service'
import { loadServiceViews } from '@/lib/services/store-services'
import { rateLimit } from '@/lib/rate-limit'
import { parseFraudForm } from '@/lib/fraud/rules'
import { parsePixelsForm } from '@/lib/pixels'
import { parseNotifyForm } from '@/lib/notify/rules'
import { saveExtra } from '@/lib/admin/extra'
import { saveFraudSettings } from '@/lib/fraud/store'
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

// Next.js requires every export of a "use server" file to be an `async function` declaration.
export async function saveStoreInfoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run('store', fd, rules.parseStoreInfo, svc.saveStoreInfo, ['/admin/settings'], 'Store details saved. The public site shows the new name within 30 seconds.')
}
export async function savePaymentsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run('payments', fd, rules.parsePaymentSettings, svc.savePayments, ['/admin/settings', '/checkout'], 'Payment and delivery rules saved. They apply to the next customer.')
}
export async function saveFieldsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run('checkout-fields', fd, rules.parseCheckoutFields, svc.saveCheckoutFields, ['/admin/settings', '/checkout'], 'Checkout form saved.')
}
export async function saveTrackingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run('tracking', fd, rules.parseTracking, svc.saveTracking, ['/admin/settings', '/track'], 'Tracking settings saved.')
}
export async function saveProductPageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run('product-page', fd, rules.parseProductPage, svc.saveProductPage, ['/admin/settings', '/product'], 'Product page saved.')
}
export async function saveFraudAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run('fraud', fd, (f) => parseFraudForm((k) => f.get(k)), saveFraudSettings, ['/admin/settings'], 'Fake-order check saved. It applies to the next order.')
}
/** The owner's advertising pixel ids (Meta, TikTok, Google Analytics). Checked strictly: they are written into the shop's pages. */
export async function savePixelsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run('pixels', fd, (f) => parsePixelsForm((k) => f.get(k)), (storeId, v) => saveExtra(storeId, 'pixels', v), ['/admin/settings'], 'Pixels saved. Your shop reports to them from the next page view.')
}
/** Which order messages customers get, on which channel, and whether the owner is emailed about new orders. */
export async function saveNotifyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run('notify', fd, (f) => parseNotifyForm((k) => f.get(k)), (storeId, v) => saveExtra(storeId, 'notify', v), ['/admin/settings'], 'Messages saved. They apply from the next order change.')
}
export async function saveCouriersAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run('couriers', fd, parseCourierForm, saveCourierConfig, ['/admin/settings', '/admin/orders'], 'Couriers saved. They are available on the order page now.')
}

/** Saves the phone-verification switch. It cannot be switched ON without a working message provider behind it. */
export async function saveOtpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('settings.edit'); if ('error' in g) return g
  const parsed = parseOtpSettings(fd)
  if (!parsed.ok) return { error: parsed.error }
  try {
    if (parsed.value.enabled) {
      const provider = resolveProvider((await loadServiceViews(g.admin.storeId)).values(), parsed.value.channel)
      if ('problem' in provider) return { error: `Not switched on. ${provider.problem}` }
    }
    await saveOtpSettings(g.admin.storeId, parsed.value)
  } catch (e) {
    console.error('[settings otp]', e)
    return { error: 'Could not save. Nothing was changed; please try again.' }
  }
  await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'settings.otp', entity: 'StoreSettings', after: parsed.value })
  for (const p of ['/admin/settings', '/checkout', '/verify']) revalidatePath(p)
  return { ok: parsed.value.enabled ? 'Phone verification is ON. Customers must verify their number before checkout.' : 'Phone verification is OFF.' }
}

export async function testOtpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('settings.edit'); if ('error' in g) return g
  // Every test is a real, billed message: slow down accidental repeats.
  const limit = rateLimit(`otp-test:${g.admin.id}`, 5, 10 * 60 * 1000)
  if (!limit.ok) return { error: 'Too many test messages. Please wait a few minutes.' }
  try {
    const channel = String(fd.get('otpChannel') ?? '') === 'WHATSAPP' ? 'WHATSAPP' : 'SMS'
    const r = await sendTestMessage(g.admin.storeId, fd.get('testPhone'), channel)
    return r.ok ? { ok: 'Test message sent. Check your phone.' } : { error: r.error }
  } catch (e) {
    console.error('[otp test]', e)
    return { error: 'The test could not be completed. Please try again.' }
  }
}
