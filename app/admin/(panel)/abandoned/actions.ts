'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError } from '@/lib/auth/guard'
import { db } from '@/lib/db'
import type { ActionState } from '@/components/admin/ActionForm'
import { featureProblem } from '@/lib/plans/access'

/** Marks an unfinished checkout as contacted, or removes it. Only one of the admin's own store. */
export async function leadAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('orders.update'); if ('error' in g) return g
  const locked = await featureProblem(g.admin.storeId, 'abandoned'); if (locked) return { error: locked }
  const id = String(fd.get('id') ?? ''), what = String(fd.get('what') ?? '')
  try {
    const scope = { id, storeId: g.admin.storeId }
    const res = what === 'contacted' ? await db.checkoutLead.updateMany({ where: scope, data: { contactedAt: new Date() } }) : what === 'remove' ? await db.checkoutLead.deleteMany({ where: scope }) : null
    if (!res) return { error: 'Invalid choice.' }
    if (res.count === 0) return { error: 'Not found. Reload the page.' }
    revalidatePath('/admin/abandoned')
    return { ok: what === 'contacted' ? 'Marked as contacted.' : 'Removed.' }
  } catch (e) { console.error('[lead]', e); return { error: 'Something went wrong. Please try again.' } }
}
