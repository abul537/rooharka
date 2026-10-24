'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { audit } from '@/lib/audit'
import { attemptLogin } from '@/lib/auth/login'
import { destroyCurrentSession, getCurrentUser } from '@/lib/auth/session'
import { clientIp } from '@/lib/rate-limit'

export interface LoginState { error?: string }

/** Only CSMI paths are allowed after login (blocks "open redirect" tricks). */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === 'string' ? value : ''
  return next.startsWith('/csmi') && !next.startsWith('//') && !next.includes('\\') ? next : '/csmi'
}

export async function csmiLoginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const h = await headers()
  const r = await attemptLogin({
    email: String(formData.get('email') ?? ''), password: String(formData.get('password') ?? ''),
    ip: clientIp(h), userAgent: h.get('user-agent') ?? undefined, area: 'platform',
  })
  if ('error' in r) return r
  redirect(safeNext(formData.get('next')))
}

export async function csmiLogoutAction() {
  const user = await getCurrentUser()
  await destroyCurrentSession()
  if (user) await audit({ storeId: null, userId: user.id, action: 'auth.logout', entity: 'User', entityId: user.id })
  redirect('/csmi/login')
}
