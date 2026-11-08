import { requireAdmin } from '@/lib/auth/guard'
import { can } from '@/lib/auth/permissions'
import { getStoreName } from '@/lib/store'
import { logoutAction } from '../login/actions'
import AdminNav from '@/components/admin/AdminNav'
import Link from 'next/link'
import { db } from '@/lib/db'
import { getBanners } from '@/lib/banners/store'
import BannerBar from '@/components/BannerBar'

// Every page inside this group requires a signed-in store admin.
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()
  const [storeName, sub, overdue, shop, banners] = await Promise.all([
    getStoreName(admin.storeId),
    db.subscription.findUnique({ where: { storeId: admin.storeId }, select: { status: true, trialEndsAt: true } }),
    db.invoice.count({ where: { storeId: admin.storeId, status: { in: ['OPEN', 'OVERDUE'] }, dueDate: { lt: new Date() } } }),
    db.store.findUnique({ where: { id: admin.storeId }, select: { shopApproval: true, shopDecisionNote: true } }),
    getBanners('STORES'),
  ])
  const trialLeft = sub?.status === 'TRIALING' && sub.trialEndsAt ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / 86_400_000)) : null
  const canBill = can(admin.role, 'settings.edit')

  const allowed = ['/admin', '/admin/orders', '/admin/customers', '/admin/security']
  if (can(admin.role, 'products.view')) allowed.push('/admin/products', '/admin/categories')
  if (can(admin.role, 'settings.edit')) allowed.push('/admin/settings', '/admin/billing')

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
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-10">
        <BannerBar banners={banners} className="mb-6 overflow-hidden rounded-xl" />
        {shop?.shopApproval === 'PENDING' && <div role="note" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm"><strong>Your shop is not open to customers yet.</strong> Set up your products and details meanwhile; the platform owner reviews new shops and will tell you when it opens.</div>}
        {shop?.shopApproval === 'DENIED' && <div role="alert" className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm"><strong>Your shop is closed to customers.</strong> {shop.shopDecisionNote ? `Reason: ${shop.shopDecisionNote}. ` : ''}Contact the platform owner once you have fixed this.</div>}
        {canBill && overdue > 0 && <div role="alert" className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm"><strong>{overdue} invoice{overdue === 1 ? ' is' : 's are'} overdue.</strong> <Link href="/admin/billing" className="underline font-medium">See how to pay</Link></div>}
        {canBill && overdue === 0 && trialLeft !== null && <div role="note" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm">Free trial: <strong>{trialLeft} day{trialLeft === 1 ? '' : 's'} left</strong>. <Link href="/admin/billing" className="underline font-medium">Plan and billing</Link></div>}
        {children}
      </main>
    </div>
  )
}
