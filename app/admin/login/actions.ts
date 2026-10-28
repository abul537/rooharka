'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { audit } from '@/lib/audit'
import { destroyCurrentSession, getCurrentUser } from '@/lib/auth/session'
import { attemptLogin, attemptSecondFactor, cancelSecondFactor } from '@/lib/auth/login'
import { clientIp } from '@/lib/rate-limit'

export interface LoginState {
  error?: string
  /** The password was right and the account has two-factor protection: ask for the code. */
  needsCode?: boolean
}

/** Only same-site dashboard paths are allowed after login (blocks "open redirect" tricks). */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === 'string' ? value : ''
  return next.startsWith('/admin') && !next.startsWith('//') && !next.includes('\\') ? next : '/admin'
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const h = await headers()
  const r = await attemptLogin({
    email: String(formData.get('email') ?? ''), password: String(formData.get('password') ?? ''),
    ip: clientIp(h), userAgent: h.get('user-agent') ?? undefined, area: 'store',
  })
  if ('error' in r) return r
  if ('needsCode' in r) return { needsCode: true }
  redirect(safeNext(formData.get('next')))
}

export async function loginCodeAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const h = await headers()
  const r = await attemptSecondFactor({ code: String(formData.get('code') ?? ''), ip: clientIp(h), userAgent: h.get('user-agent') ?? undefined, area: 'store' })
  if ('error' in r) return { ...r, needsCode: !r.error.startsWith('Your sign-in took too long') }
  redirect(safeNext(formData.get('next')))
}

export async function loginRestartAction() {
  await cancelSecondFactor()
}

export async function logoutAction() {
  const user = await getCurrentUser()
  await destroyCurrentSession()
  if (user) await audit({ storeId: user.storeId, userId: user.id, action: 'auth.logout', entity: 'User', entityId: user.id })
  redirect('/admin/login')
}
