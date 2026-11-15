'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import type { ActionState } from '@/components/admin/ActionForm'

/** Approve (show in the shop), hide again, or delete one review. Only a review of a product of the admin's own store. */
export async function reviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('products.edit'); if ('error' in g) return g
  const id = String(fd.get('id') ?? ''), what = String(fd.get('what') ?? '')
  try {
    const r = await db.review.findFirst({ where: { id, product: { storeId: g.admin.storeId } }, select: { id: true, authorName: true } })
    if (!r) return { error: 'Review not found. Reload the page.' }
    const scope = { id: r.id, product: { storeId: g.admin.storeId } }
    if (what === 'approve') await db.review.updateMany({ where: scope, data: { isApproved: true } })
    else if (what === 'hide') await db.review.updateMany({ where: scope, data: { isApproved: false } })
    else if (what === 'delete') await db.review.deleteMany({ where: scope })
    else return { error: 'Invalid choice.' }
    // The audit line also clears the shop's remembered pages, so an approved review shows at once.
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: `review.${what}`, entity: 'Review', entityId: r.id })
    revalidatePath('/admin/reviews')
    return { ok: what === 'approve' ? `The review by ${r.authorName} is now shown in your shop.` : what === 'hide' ? 'The review is hidden.' : 'The review was deleted.' }
  } catch (e) { console.error('[review]', e); return { error: 'Something went wrong. Nothing was changed; please try again.' } }
}
