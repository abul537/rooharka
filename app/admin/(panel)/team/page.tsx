import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/guard'
import { formatPkt } from '@/lib/admin/dates'
import { loadEntitlements } from '@/lib/entitlements/service'
import { isOverStaffLimit, staffSlotProblem, staffUsage } from '@/lib/entitlements/rules'
import { TEAM_ROLES, TEAM_ROLE_LABEL } from '@/lib/team/rules'
import ActionForm from '@/components/admin/ActionForm'
import { Card, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { addMemberAction, resetMemberPasswordAction, setMemberActiveAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  const admin = await requireAdmin('staff.manage')
  const [ent, members] = await Promise.all([
    loadEntitlements(admin.storeId),
    db.user.findMany({ where: { storeId: admin.storeId }, orderBy: [{ role: 'asc' }, { createdAt: 'asc' }], select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true } }),
  ])
  const full = staffSlotProblem(ent.staff.used, ent.staff)
  const over = isOverStaffLimit(ent.staff.used, ent.staff)

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Team</h1>
        <p className="text-sm text-slate-600 mt-1">People who sign in to this dashboard. You (the owner) are always included for free. <strong>{staffUsage(ent.staff.used, ent.staff)}</strong>{ent.planName ? ` on the ${ent.planName} plan` : ''}. The number of staff logins is set by the platform owner.</p>
      </div>
      {over && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm">You have more active staff than your plan allows. Nobody is removed, but you cannot add or switch on anyone until you are within the limit.</div>}

      <Card title="Add a team member" hint="Give them a starting password (at least 12 characters) and tell it to them in person. They should change it under “My security”.">
        {full ? <p className="text-sm text-slate-700">{full}</p> : (
          <ActionForm action={addMemberAction} className="grid sm:grid-cols-2 gap-3">
            <Field label="Full name"><input name="name" required maxLength={50} className={inputCls} /></Field>
            <Field label="Email (their login)"><input name="email" type="email" required maxLength={120} autoComplete="off" className={inputCls} /></Field>
            <Field label="Role">
              <select name="role" defaultValue="STORE_STAFF" className={inputCls}>{TEAM_ROLES.map((r) => <option key={r} value={r}>{TEAM_ROLE_LABEL[r]}</option>)}</select>
            </Field>
            <Field label="Starting password"><input name="password" type="text" required minLength={12} maxLength={128} autoComplete="off" className={inputCls} /></Field>
            <div className="sm:col-span-2"><button className={primaryBtn}>Add team member</button></div>
          </ActionForm>
        )}
      </Card>

      <Card title="Everyone with a login">
        <ul className="divide-y divide-slate-100 text-sm">
          {members.map((m) => (
            <li key={m.id} className="py-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{m.name} <span className="text-xs font-normal text-slate-500">{m.role === 'STORE_OWNER' ? 'owner' : m.role === 'STORE_MANAGER' ? 'manager' : 'staff'}</span>{!m.isActive && <span className="ml-2 text-xs text-red-700">switched off</span>}</p>
                  <p className="text-slate-600">{m.email} · {m.lastLoginAt ? `last sign-in ${formatPkt(m.lastLoginAt)}` : 'never signed in'}</p>
                </div>
                {m.role !== 'STORE_OWNER' && (
                  <ActionForm action={setMemberActiveAction} confirm={m.isActive ? `Switch off ${m.name}? They are signed out at once.` : undefined}>
                    <input type="hidden" name="userId" value={m.id} /><input type="hidden" name="active" value={m.isActive ? '0' : '1'} />
                    <button className="underline">{m.isActive ? 'Switch off' : 'Switch on'}</button>
                  </ActionForm>
                )}
              </div>
              {m.role !== 'STORE_OWNER' && (
                <ActionForm action={resetMemberPasswordAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="userId" value={m.id} /><input type="hidden" name="email" value={m.email} />
                  <input name="password" type="text" placeholder="New password for them" aria-label={`New password for ${m.name}`} autoComplete="off" maxLength={128} className="rounded border border-slate-300 px-2 py-1 text-xs w-56" />
                  <button className="rounded border border-slate-300 px-2.5 py-1 text-xs">Reset password</button>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
