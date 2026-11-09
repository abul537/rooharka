'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { parseNewMember, parseNewPassword } from '@/lib/team/rules'
import { TeamError, addMember, resetMemberPassword, setMemberActive } from '@/lib/team/service'
import type { ActionState } from '@/components/admin/ActionForm'

const fail = (e: unknown, what: string): ActionState => {
  if (e instanceof TeamError) return { error: e.message }
  console.error(`[team ${what}]`, e)
  return { error: 'Something went wrong. Nothing was changed; please try again.' }
}

export async function addMemberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('staff.manage'); if ('error' in g) return g
  const p = parseNewMember(fd); if (!p.ok) return { error: p.error }
  try {
    const u = await addMember(g.admin, p.value)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'team.add', entity: 'User', entityId: u.id, after: { email: u.email, role: u.role } })
    revalidatePath('/admin/team')
    return { ok: `${p.value.name} can now sign in at the dashboard login with ${p.value.email} and the starting password you set. Ask them to change it under “My security”.` }
  } catch (e) { return fail(e, 'add') }
}

export async function setMemberActiveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('staff.manage'); if ('error' in g) return g
  const active = fd.get('active') === '1'
  try {
    const u = await setMemberActive(g.admin, String(fd.get('userId') ?? ''), active)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: active ? 'team.on' : 'team.off', entity: 'User', entityId: u.id, after: { email: u.email } })
    revalidatePath('/admin/team')
    return { ok: active ? `${u.name} can sign in again.` : `${u.name} is switched off and signed out everywhere.` }
  } catch (e) { return fail(e, 'switch') }
}

export async function resetMemberPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('staff.manage'); if ('error' in g) return g
  try {
    const email = String(fd.get('email') ?? '')
    const p = parseNewPassword(fd, email); if (!p.ok) return { error: p.error }
    const u = await resetMemberPassword(g.admin, String(fd.get('userId') ?? ''), p.value)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'team.password', entity: 'User', entityId: u.id })
    revalidatePath('/admin/team')
    return { ok: `${u.name}'s password was changed and they were signed out everywhere.` }
  } catch (e) { return fail(e, 'password') }
}
