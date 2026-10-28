'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { audit } from '@/lib/audit'
import { attemptLogin, attemptSecondFactor, cancelSecondFactor } from '@/lib/auth/login'
import { destroyCurrentSession, getCurrentUser } from '@/lib/auth/session'
import { clientIp } from '@/lib/rate-limit'

export interface LoginState {
  error?: string
  /** The password was right and the account has two-factor protection: ask for the code. */
  needsCode?: boolean
}

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
  if ('needsCode' in r) return { needsCode: true }
  redirect(safeNext(formData.get('next')))
}

export async function csmiLoginCodeAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const h = await headers()
  const r = await attemptSecondFactor({ code: String(formData.get('code') ?? ''), ip: clientIp(h), userAgent: h.get('user-agent') ?? undefined, area: 'platform' })
  if ('error' in r) return { ...r, needsCode: !r.error.startsWith('Your sign-in took too long') }
  redirect(safeNext(formData.get('next')))
}

export async function csmiLoginRestartAction() {
  await cancelSecondFactor()
}

export async function csmiLogoutAction() {
  const user = await getCurrentUser()
  await destroyCurrentSession()
  if (user) await audit({ storeId: null, userId: user.id, action: 'auth.logout', entity: 'User', entityId: user.id })
  redirect('/csmi/login')
}
