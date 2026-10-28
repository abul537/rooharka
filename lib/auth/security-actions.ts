'use server'

import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'
import { changePassword } from '@/lib/auth/account'
import { getCurrentUser } from '@/lib/auth/session'
import { AuthError, beginEnrollment, confirmEnrollment, disableTwoFactor, regenerateRecoveryCodes } from '@/lib/auth/twofactor'

/** What the security forms show after each step. Plain data only (no functions or Dates). */
export interface SecurityState {
  ok?: string
  error?: string
  /** Setup key and link for the authenticator app. */
  setup?: { key: string; uri: string }
  /** Shown ONCE, right after protection is switched on or the codes are renewed. */
  recoveryCodes?: string[]
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '')
const refresh = () => { revalidatePath('/admin/security'); revalidatePath('/csmi/security'); revalidatePath('/csmi', 'layout'); revalidatePath('/admin', 'layout') }

/** Same pipeline for every action here: signed-in user (any role: it is their OWN account) -> work -> audit. */
async function run(action: string, work: (user: { id: string; storeId: string | null }) => Promise<SecurityState>): Promise<SecurityState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Your session has expired. Please sign in again.' }
  try {
    const r = await work(user)
    await audit({ storeId: user.storeId, userId: user.id, action: `auth.${action}`, entity: 'User', entityId: user.id })
    refresh()
    return r
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message }
    console.error(`[security ${action}]`, e)
    return { error: 'Something went wrong. Nothing was changed; please try again.' }
  }
}

export async function startTwoFactorAction(): Promise<SecurityState> {
  return run('2fa_setup_started', async (u) => ({ setup: await beginEnrollment(u.id) }))
}

export async function confirmTwoFactorAction(_: SecurityState, fd: FormData): Promise<SecurityState> {
  return run('2fa_enabled', async (u) => ({ ...(await confirmEnrollment(u.id, str(fd, 'code'))), ok: 'Two-factor protection is on.' }))
}

export async function disableTwoFactorAction(_: SecurityState, fd: FormData): Promise<SecurityState> {
  return run('2fa_disabled', async (u) => { await disableTwoFactor(u.id, str(fd, 'password'), str(fd, 'code')); return { ok: 'Two-factor protection is off.' } })
}

export async function regenerateCodesAction(_: SecurityState, fd: FormData): Promise<SecurityState> {
  return run('2fa_codes_renewed', async (u) => ({ ...(await regenerateRecoveryCodes(u.id, str(fd, 'password'), str(fd, 'code'))), ok: 'New recovery codes created. The old ones no longer work.' }))
}

export async function changePasswordAction(_: SecurityState, fd: FormData): Promise<SecurityState> {
  return run('password_changed', async (u) => {
    await changePassword(u.id, { current: str(fd, 'current'), next: str(fd, 'next'), confirm: str(fd, 'confirm') })
    return { ok: 'Password changed. Any other browsers or phones signed in to your account have been signed out.' }
  })
}
