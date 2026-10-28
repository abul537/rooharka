import { requireAdmin } from '@/lib/auth/guard'
import { twoFactorStatus } from '@/lib/auth/twofactor'
import SecurityPanel from '@/components/auth/SecurityPanel'

export const dynamic = 'force-dynamic'

export default async function SecurityPage() {
  const admin = await requireAdmin() // any signed-in staff member may manage their OWN account
  const s = await twoFactorStatus(admin.id)
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Account security</h1><p className="text-sm text-slate-600 mt-1">{admin.email}</p></div>
      <SecurityPanel twoFactorEnabled={s.enabled} recoveryLeft={s.recoveryLeft} />
    </div>
  )
}
