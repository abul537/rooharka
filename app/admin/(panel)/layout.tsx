import { requireAdmin } from '@/lib/auth/guard'
import { can } from '@/lib/auth/permissions'
import { getStoreName } from '@/lib/store'
import { logoutAction } from '../login/actions'
import AdminNav from '@/components/admin/AdminNav'

// Every page inside this group requires a signed-in store admin.
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()
  const storeName = await getStoreName(admin.storeId)

  const allowed = ['/admin', '/admin/orders', '/admin/customers']
  if (can(admin.role, 'products.view')) allowed.push('/admin/products', '/admin/categories')
  if (can(admin.role, 'settings.edit')) allowed.push('/admin/settings')

  return (
    <div className="lg:flex min-h-screen">
      <aside className="lg:w-60 lg:shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 p-4 lg:p-5">
        <div className="flex lg:block items-center justify-between mb-3 lg:mb-8">
          <div>
            <p className="font-bold text-lg leading-tight">{storeName}</p>
            <p className="text-xs text-slate-500">Dashboard</p>
          </div>
          <form action={logoutAction} className="lg:hidden">
            <button className="text-sm text-slate-600 underline">Sign out</button>
          </form>
        </div>
        <AdminNav allowed={allowed} />
        <div className="hidden lg:block mt-10 pt-4 border-t border-slate-200 text-sm">
          <p className="font-medium truncate" title={admin.email}>{admin.name}</p>
          <p className="text-slate-500 truncate mb-3">{admin.role.replace('STORE_', '').toLowerCase()}</p>
          <form action={logoutAction}><button className="text-slate-600 underline">Sign out</button></form>
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-10">{children}</main>
    </div>
  )
}
