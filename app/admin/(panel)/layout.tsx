import { requireAdmin } from '@/lib/auth/guard'
import { can } from '@/lib/auth/permissions'
import { getStoreName } from '@/lib/store'
import { logoutAction } from '../login/actions'
import AdminNav from '@/components/admin/AdminNav'
import Link from 'next/link'
import { Eye } from 'lucide-react'
import { db } from '@/lib/db'
import { getBanners } from '@/lib/banners/store'
import BannerBar from '@/components/BannerBar'
import { loadPosAccess } from '@/lib/entitlements/service'

// Every page inside this group requires a signed-in store admin.
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()
  const [storeName, sub, overdue, shop, banners, unread, pos] = await Promise.all([
    getStoreName(admin.storeId),
    db.subscription.findUnique({ where: { storeId: admin.storeId }, select: { status: true, trialEndsAt: true } }),
    db.invoice.count({ where: { storeId: admin.storeId, status: { in: ['OPEN', 'OVERDUE'] }, dueDate: { lt: new Date() } } }),
    db.store.findUnique({ where: { id: admin.storeId }, select: { shopApproval: true, shopDecisionNote: true } }),
    getBanners('STORES'),
    db.contactMessage.count({ where: { storeId: admin.storeId, isRead: false } }),
    loadPosAccess(admin.storeId), // whether the platform owner allows POS lite for this store
  ])
  const trialLeft = sub?.status === 'TRIALING' && sub.trialEndsAt ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / 86_400_000)) : null
  const canBill = can(admin.role, 'settings.edit')

  const allowed = ['/admin', '/admin/orders', '/admin/messages', '/admin/customers', '/admin/security']
  if (can(admin.role, 'products.view')) allowed.push('/admin/products', '/admin/collections', '/admin/categories')
  if (can(admin.role, 'settings.edit')) allowed.push('/admin/storefront', '/admin/settings', '/admin/billing')
  if (can(admin.role, 'staff.manage')) allowed.push('/admin/team')
  if (pos.enabled && can(admin.role, 'pos.sell')) allowed.push('/admin/pos')

  return (
    <div className="lg:flex min-h-screen bg-slate-50">
      <aside className="print:hidden lg:w-60 lg:shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 p-4 lg:p-5">
        <div className="flex lg:block items-center justify-between mb-3 lg:mb-8">
          <div>
            <p className="font-bold text-lg leading-tight">{storeName}</p>
            <p className="text-xs text-slate-500">Dashboard</p>
          </div>
          <form action={logoutAction} className="lg:hidden">
            <button className="text-sm text-slate-600 underline">Sign out</button>
          </form>
        </div>
        {/* Opens the shop in a new tab as the owner sees it: draft products included, and even before the shop is approved. */}
        <a href="/admin/preview" target="_blank" rel="noopener" title="See your shop with your draft products. Customers cannot see this view."
          className="mb-3 flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
          <Eye className="h-4 w-4" aria-hidden /> Preview store
        </a>
        <AdminNav allowed={allowed} unread={unread} />
        <div className="hidden lg:block mt-10 pt-4 border-t border-slate-200 text-sm">
          <p className="font-medium truncate" title={admin.email}>{admin.name}</p>
          <p className="text-slate-500 truncate mb-3">{admin.role.replace('STORE_', '').toLowerCase()}</p>
          <form action={logoutAction}><button className="text-slate-600 underline">Sign out</button></form>
        </div>
      </aside>
      <main className="flex-1 min-w-0 print:p-0 p-4 sm:p-6 lg:p-10">
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
