import { redirect } from 'next/navigation'
import { getCurrentUser, type CurrentUser } from '@/lib/auth/session'
import { canPlatform, isPlatformRole, type PlatformPermission } from '@/lib/csmi/rules'

export interface PlatformUser extends CurrentUser { storeId: null }

/**
 * Top of EVERY CSMI page: only platform staff (no store attached) get in. A store owner, even a valid one,
 * is sent to the CSMI login and sees nothing. `csmi.manage` (money, stores, plans) is the owner only.
 */
export async function requirePlatform(permission: PlatformPermission = 'csmi.view'): Promise<PlatformUser> {
  const user = await getCurrentUser()
  if (!user || user.storeId !== null || !isPlatformRole(user.role)) redirect('/csmi/login')
  if (!canPlatform(user.role, permission)) redirect('/csmi?denied=1')
  return user as PlatformUser
}

/** For server actions: report "not allowed" to the form instead of redirecting. */
export async function platformOrError(permission: PlatformPermission): Promise<{ user: PlatformUser } | { error: string }> {
  const user = await getCurrentUser()
  if (!user || user.storeId !== null || !isPlatformRole(user.role)) return { error: 'Your session has expired. Please sign in again.' }
  if (!canPlatform(user.role, permission)) return { error: 'You do not have permission to do this.' }
  return { user: user as PlatformUser }
}
