'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import type { ActionState } from '@/components/admin/ActionForm'

/** Marks one message (or all) read, or deletes one. Always scoped to the signed-in store. */
export async function messageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('orders.view')
  if ('error' in g) return g
  const { storeId } = g.admin
  const op = String(fd.get('op') ?? ''), id = String(fd.get('id') ?? '')
  try {
    if (op === 'read') await db.contactMessage.updateMany({ where: { id, storeId }, data: { isRead: true } })
    else if (op === 'unread') await db.contactMessage.updateMany({ where: { id, storeId }, data: { isRead: false } })
    else if (op === 'all') await db.contactMessage.updateMany({ where: { storeId, isRead: false }, data: { isRead: true } })
    else if (op === 'delete') {
      await db.contactMessage.deleteMany({ where: { id, storeId } })
      await audit({ storeId, userId: g.admin.id, action: 'message.delete', entity: 'ContactMessage', entityId: id })
    } else return { error: 'Unknown action.' }
  } catch (e) {
    console.error('[messages]', e)
    return { error: 'Could not do that. Please try again.' }
  }
  revalidatePath('/admin/messages'); revalidatePath('/admin', 'layout')
  return {}
}
