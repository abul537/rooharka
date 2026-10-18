'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { AdminError } from '@/lib/admin/orders'
import { saveNotes, setBlocked } from '@/lib/admin/customers'
import type { ActionState } from '@/components/admin/ActionForm'

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '')

export async function blockAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('customers.block'); if ('error' in g) return g
  const id = str(fd, 'customerId'), block = str(fd, 'block') === '1'
  try {
    await setBlocked(g.admin, id, block, str(fd, 'reason'))
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: block ? 'customer.block' : 'customer.unblock', entity: 'Customer', entityId: id })
    revalidatePath(`/admin/customers/${id}`)
    return { ok: block ? 'This phone number can no longer place orders.' : 'This phone number can order again.' }
  } catch (e) {
    if (e instanceof AdminError) return { error: e.message }
    console.error('[customer block]', e)
    return { error: 'Something went wrong. Nothing was changed.' }
  }
}

export async function notesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('customers.block'); if ('error' in g) return g
  const id = str(fd, 'customerId')
  try {
    await saveNotes(g.admin, id, str(fd, 'notes'))
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'customer.notes', entity: 'Customer', entityId: id })
    revalidatePath(`/admin/customers/${id}`)
    return { ok: 'Notes saved.' }
  } catch (e) {
    if (e instanceof AdminError) return { error: e.message }
    console.error('[customer notes]', e)
    return { error: 'Something went wrong. Nothing was changed.' }
  }
}
