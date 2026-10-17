import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { isStaffRole } from '@/lib/auth/permissions'
import LoginForm from './LoginForm'

export const metadata = { title: 'Sign in' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  const user = await getCurrentUser()
  if (user?.storeId && isStaffRole(user.role)) redirect('/admin')

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold text-slate-900">Store dashboard</h1>
        <p className="text-slate-600 mb-6">Sign in to manage your store.</p>
        <LoginForm next={next ?? '/admin'} />
      </div>
    </div>
  )
}
