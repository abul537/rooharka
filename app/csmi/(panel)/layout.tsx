import { requirePlatform } from '@/lib/csmi/guard'
import { csmiLogoutAction } from '../login/actions'
import CsmiNav from '@/components/csmi/CsmiNav'

// Every page inside this group requires a signed-in platform owner or support member.
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatform()
  return (
    <div className="lg:flex min-h-screen">
      <aside className="lg:w-60 lg:shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 p-4 lg:p-5">
        <div className="flex lg:block items-center justify-between mb-3 lg:mb-8">
          <div>
            <p className="font-bold text-lg leading-tight">CSMI</p>
            <p className="text-xs text-slate-500">All stores</p>
          </div>
          <form action={csmiLogoutAction} className="lg:hidden"><button className="text-sm text-slate-600 underline">Sign out</button></form>
        </div>
        <CsmiNav />
        <div className="hidden lg:block mt-10 pt-4 border-t border-slate-200 text-sm">
          <p className="font-medium truncate" title={user.email}>{user.name}</p>
          <p className="text-slate-500 truncate mb-3">{user.role === 'PLATFORM_OWNER' ? 'owner' : 'support (view only)'}</p>
          <form action={csmiLogoutAction}><button className="text-slate-600 underline">Sign out</button></form>
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-10">{children}</main>
    </div>
  )
}
