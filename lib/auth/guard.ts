import { redirect } from 'next/navigation'
import { getCurrentUser, type CurrentUser } from './session'
import { can, isStaffRole, type Permission } from './permissions'

export interface StoreAdmin extends CurrentUser {
  /** Always present: every dashboard query is limited to THIS store. */
  storeId: string
}

/**
 * Call at the top of EVERY admin page and EVERY admin action:
 *   const admin = await requireAdmin('orders.update')
 * - not signed in            -> sent to the login page
 * - not a store staff member -> sent to login (platform staff use a different area)
 * - role lacks permission    -> redirected to the dashboard home
 * It returns the user with a guaranteed storeId; always filter queries by it, which
 * is what stops one store's owner from ever reading another store's data.
 */
export async function requireAdmin(permission?: Permission): Promise<StoreAdmin> {
  const user = await getCurrentUser()
  if (!user || !user.storeId || !isStaffRole(user.role)) redirect('/admin/login')
  if (permission && !can(user.role, permission)) redirect('/admin?denied=1')
  return user as StoreAdmin
}

/** For server actions that should report "not allowed" to the form instead of redirecting. */
export async function adminOrError(permission: Permission): Promise<{ admin: StoreAdmin } | { error: string }> {
  const user = await getCurrentUser()
  if (!user || !user.storeId || !isStaffRole(user.role)) return { error: 'Your session has expired. Please sign in again.' }
  if (!can(user.role, permission)) return { error: 'You do not have permission to do this.' }
  return { admin: user as StoreAdmin }
}
