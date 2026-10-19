'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { serviceDef, parseServiceForm } from '@/lib/services/registry'
import { getServiceSecrets, recordServiceResult, removeService, saveService } from '@/lib/services/store-services'
import { testConnection } from '@/lib/services/connection-test'
import type { ActionState } from '@/components/admin/ActionForm'

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '')

// Next.js: every export of a "use server" file must be an `async function`.
export async function saveServiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('settings.edit'); if ('error' in g) return g
  const def = serviceDef(str(fd, 'serviceKey'))
  if (!def) return { error: 'Unknown service.' }
  try {
    const existing = await getServiceSecrets(g.admin.storeId, def.key)
    const parsed = parseServiceForm(def, fd, existing?.credentials)
    if (!parsed.ok) return { error: parsed.error }
    const enabled = fd.get('enabled') === 'on'
    await saveService(g.admin.storeId, def, parsed.value, { enabled, isDefault: fd.get('isDefault') === 'on' })
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'service.save', entity: 'StoreService', entityId: def.key, after: { enabled } }) // never the keys
    revalidatePath('/admin/settings')
    return { ok: `${def.name} saved${enabled ? ' and switched on' : ''}.` }
  } catch (e) {
    console.error('[service save]', e)
    return { error: 'Could not save. Nothing was changed; please try again.' }
  }
}

export async function testServiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('settings.edit'); if ('error' in g) return g
  const def = serviceDef(str(fd, 'serviceKey'))
  if (!def) return { error: 'Unknown service.' }
  try {
    const s = await getServiceSecrets(g.admin.storeId, def.key)
    if (!s) return { error: 'Save your details first, then test.' }
    const r = await testConnection(def.key, s.credentials, s.config)
    await recordServiceResult(g.admin.storeId, def.key, r.ok ? null : r.error)
    revalidatePath('/admin/settings')
    return r.ok ? { ok: r.message } : { error: r.error }
  } catch (e) {
    console.error('[service test]', e)
    return { error: 'The test could not be completed. Please try again.' }
  }
}

export async function removeServiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('settings.edit'); if ('error' in g) return g
  const def = serviceDef(str(fd, 'serviceKey'))
  if (!def) return { error: 'Unknown service.' }
  try {
    await removeService(g.admin.storeId, def.key)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'service.remove', entity: 'StoreService', entityId: def.key })
    revalidatePath('/admin/settings')
    return { ok: `${def.name} was disconnected and its saved keys were deleted.` }
  } catch (e) {
    console.error('[service remove]', e)
    return { error: 'Could not remove. Please try again.' }
  }
}
