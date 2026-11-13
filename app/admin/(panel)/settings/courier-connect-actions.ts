'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { getCourierAdapter } from '@/lib/couriers/factory'
import { disconnect, saveToken } from '@/lib/couriers/vault'
import { isCourierError } from '@/lib/couriers/contract'
import { parseToken } from '@/lib/couriers/connect-rules'
import { rateLimit } from '@/lib/rate-limit'
import type { ActionState } from '@/components/admin/ActionForm'

const PROVIDER = 'postex'

/** "Connect": prove the token with a harmless read-only call, THEN encrypt and save it. A wrong token is never stored. */
export async function connectPostexAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('settings.edit'); if ('error' in g) return g
  const t = parseToken(fd.get('token'))
  if (!t.ok) return { error: t.error }
  if (!rateLimit(`courier-connect:${g.admin.storeId}`, 10, 10 * 60_000).ok) return { error: 'Too many tries. Please wait a few minutes and try again.' }
  try {
    await getCourierAdapter(PROVIDER).verifyCredentials({ token: t.token })
  } catch (e) {
    if (isCourierError(e) && e.kind === 'unreachable') return { error: 'We could not reach PostEx just now. Please try again in a minute.' }
    return { error: 'We couldn’t verify this token. Please check you copied it correctly.' }
  }
  try {
    await saveToken(g.admin.storeId, PROVIDER, t.token)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'courier.connect', entity: 'TenantCourierCredential', entityId: PROVIDER }) // never the token
  } catch (e) {
    console.error('[courier connect] save failed', e instanceof Error ? e.message : 'error') // never the token
    return { error: 'We could not save it. Nothing was changed; please try again.' }
  }
  revalidatePath('/admin/settings')
  return { ok: 'PostEx is connected. New orders are now sent to PostEx automatically.' }
}

export async function disconnectPostexAction(): Promise<ActionState> {
  const g = await adminOrError('settings.edit'); if ('error' in g) return g
  await disconnect(g.admin.storeId, PROVIDER)
  await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'courier.disconnect', entity: 'TenantCourierCredential', entityId: PROVIDER })
  revalidatePath('/admin/settings')
  return { ok: 'PostEx is disconnected. New orders will no longer be sent automatically.' }
}
