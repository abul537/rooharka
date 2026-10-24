import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { isPlatformRole } from '@/lib/csmi/rules'
import CsmiLoginForm from './CsmiLoginForm'

export const metadata = { title: 'Sign in' }

export default async function CsmiLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  const user = await getCurrentUser()
  if (user && user.storeId === null && isPlatformRole(user.role)) redirect('/csmi')
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold text-slate-900">CSMI</h1>
        <p className="text-slate-600 mb-6">Platform owner sign-in. Store owners sign in at their own dashboard.</p>
        <CsmiLoginForm next={next ?? '/csmi'} />
      </div>
    </div>
  )
}
