export type StaffRole = 'STORE_OWNER' | 'STORE_MANAGER' | 'STORE_STAFF'

/**
 * What each role may do. Checked on the SERVER in every page and action. Hiding a
 * button is only for tidiness, never for security.
 */
export type Permission =
  | 'orders.view'
  | 'orders.update'        // change status, add shipment
  | 'orders.cancel'
  | 'payments.confirm'     // mark an advance payment as received / rejected
  | 'customers.view'
  | 'customers.block'
  | 'products.view'
  | 'products.edit'        // prices, stock, texts
  | 'settings.edit'        // checkout fields, payment rules, wallets, theme switches

const MATRIX: Record<StaffRole, Permission[]> = {
  STORE_OWNER: ['orders.view', 'orders.update', 'orders.cancel', 'payments.confirm', 'customers.view', 'customers.block', 'products.view', 'products.edit', 'settings.edit'],
  STORE_MANAGER: ['orders.view', 'orders.update', 'orders.cancel', 'payments.confirm', 'customers.view', 'customers.block', 'products.view', 'products.edit', 'settings.edit'],
  STORE_STAFF: ['orders.view', 'orders.update', 'customers.view', 'products.view'],
}

export function can(role: string, permission: Permission): boolean {
  return (MATRIX[role as StaffRole] ?? []).includes(permission)
}

export const isStaffRole = (role: string): role is StaffRole => role in MATRIX
