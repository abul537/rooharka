'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { normalizeHost } from '@/lib/domains'
import { marketingAllowed, platformOrigin } from '@/lib/platform-host'
import { clientIp } from '@/lib/rate-limit'
import { parseSignupForm } from '@/lib/signup/rules'
import { SignupError, confirmSignup, startSignup } from '@/lib/signup/service'

export interface SignupState {
  error?: string
  /** What the person typed, handed back so a mistake never makes them retype everything. NEVER the password. */
  values?: Record<string, string>
}

const KEEP = ['ownerName', 'email', 'phone', 'storeName', 'slug', 'planId', 'interval', 'offerCode'] as const
const GENERIC = 'Something went wrong on our side. Nothing was saved; please try again in a moment.'

export async function signupAction(_prev: SignupState, fd: FormData): Promise<SignupState> {
  const h = await headers()
  const host = normalizeHost(h.get('host'))
  const values = Object.fromEntries(KEEP.map((k) => [k, String(fd.get(k) ?? '')]))
  if (!marketingAllowed(host)) return { error: 'Sign-up is not available on this address.' }

  const parsed = parseSignupForm(fd)
  if (!parsed.ok) return { error: parsed.error, values }

  let next: 'check-email' | 'pending'
  try {
    next = (await startSignup(parsed.value, { ip: clientIp(h), userAgent: h.get('user-agent') ?? undefined, origin: platformOrigin(host) })).next
  } catch (e) {
    if (e instanceof SignupError) return { error: e.message, values }
    console.error('[signup]', e)
    return { error: GENERIC, values }
  }
  redirect(next === 'check-email' ? '/signup/check-email' : '/signup/pending')
}

export async function confirmEmailAction(_prev: SignupState, fd: FormData): Promise<SignupState> {
  const h = await headers()
  if (!marketingAllowed(normalizeHost(h.get('host')))) return { error: 'Sign-up is not available on this address.' }
  let state: 'ready' | 'pending'
  try {
    state = (await confirmSignup(String(fd.get('token') ?? ''), { ip: clientIp(h), userAgent: h.get('user-agent') ?? undefined })).state
  } catch (e) {
    if (e instanceof SignupError) return { error: e.message }
    console.error('[signup confirm]', e)
    return { error: GENERIC }
  }
  redirect(state === 'ready' ? '/admin' : '/signup/pending')
}
