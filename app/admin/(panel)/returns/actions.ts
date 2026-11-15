'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { AdminError } from '@/lib/admin/orders'
import { saveExtra } from '@/lib/admin/extra'
import { parseRefund, parseReturnPolicy } from '@/lib/returns'
import { completeReturn, decideReturn, receiveReturn, startReturn } from '@/lib/returns-data'
import type { ActionState } from '@/components/admin/ActionForm'

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').replace(/\s+/g, ' ').trim()
function fail(e: unknown): ActionState {
  if (e instanceof AdminError) return { error: e.message }
  console.error('[return action]', e)
  return { error: 'Something went wrong. Nothing was changed; please try again.' }
}
const done = (ok: string): ActionState => { revalidatePath('/admin/returns'); revalidatePath('/admin/orders'); return { ok } }

/** The shop's return policy: whether customers may ask online, for how many days, and the words they see. */
export async function returnPolicyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('settings.edit'); if ('error' in g) return g
  const parsed = parseReturnPolicy((k) => fd.get(k))
  if (!parsed.ok) return { error: parsed.error }
  try {
    await saveExtra(g.admin.storeId, 'returns', parsed.value)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'settings.returns', entity: 'StoreSettings', after: { enabled: parsed.value.enabled, days: parsed.value.days } })
    return done(parsed.value.enabled ? `Saved. Customers can ask for a return for ${parsed.value.days} days after delivery.` : 'Saved. Customers cannot ask for returns online; you can still start one yourself.')
  } catch (e) { return fail(e) }
}

/** The owner starts a return for a delivered order (from the order's page). */
export async function startReturnAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('orders.update'); if ('error' in g) return g
  try {
    const r = await startReturn(g.admin, str(fd, 'orderId'))
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'return.start', entity: 'ReturnRequest', entityId: r.id })
    return done(`Return opened for order #${r.number}. Continue under Returns.`)
  } catch (e) { return fail(e) }
}

/** One button per step: approve, refuse, received (with or without restocking), refund recorded. */
export async function returnStepAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const what = str(fd, 'what'), id = str(fd, 'id')
  // Recording money needs the permission for money; everything else the permission for orders.
  const g = await adminOrError(what === 'refund' ? 'payments.confirm' : 'orders.update'); if ('error' in g) return g
  try {
    if (what === 'approve' || what === 'reject') {
      const r = await decideReturn(g.admin, id, what === 'approve', str(fd, 'answer').slice(0, 250))
      await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: `return.${what}`, entity: 'ReturnRequest', entityId: id })
      return done(what === 'approve' ? `Approved. The customer of order #${r.number} sees this on their tracking page.` : 'Refused. The customer sees your reason on their tracking page.')
    }
    if (what === 'received') {
      const r = await receiveReturn(g.admin, id, fd.get('restock') === 'on')
      await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'return.received', entity: 'ReturnRequest', entityId: id, after: { restocked: r.restocked } })
      return done(`Marked as received${r.restocked ? ' and put back in stock' : ''}.${r.whole ? ` Order #${r.number} is now “Returned”.` : ''}`)
    }
    if (what === 'refund') {
      const r = await completeReturn(g.admin, id, (ceiling) => parseRefund((k) => fd.get(k), ceiling))
      await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'return.refund', entity: 'ReturnRequest', entityId: id, after: { amount: r.amount } })
      return done(r.amount > 0 ? `Refund of Rs. ${r.amount.toLocaleString('en-PK')} recorded for order #${r.number}.` : 'Return completed with no refund.')
    }
    return { error: 'Invalid choice.' }
  } catch (e) { return fail(e) }
}
