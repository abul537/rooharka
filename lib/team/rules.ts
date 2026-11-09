/** Rules for adding a team member. Pure, so they are unit-tested. */
import type { Getter, Parsed } from '@/lib/admin/settings-rules'
import { passwordProblem } from '@/lib/auth/password'
import { validateEmail, validateName } from '@/lib/validation'

/** The owner is created at sign-up and can never be added, switched off or changed here. */
export const TEAM_ROLES = ['STORE_MANAGER', 'STORE_STAFF'] as const
export type TeamRole = (typeof TEAM_ROLES)[number]
export const TEAM_ROLE_LABEL: Record<TeamRole, string> = { STORE_MANAGER: 'Manager (products, settings, orders, POS)', STORE_STAFF: 'Staff (orders, view products, POS)' }

export interface NewMember { name: string; email: string; role: TeamRole; password: string }

export function parseNewMember(g: Getter): Parsed<NewMember> {
  const name = String(g.get('name') ?? '').trim().replace(/\s+/g, ' ')
  const email = String(g.get('email') ?? '').trim().toLowerCase()
  const role = TEAM_ROLES.find((r) => r === g.get('role'))
  const password = String(g.get('password') ?? '')
  const nameProblem = validateName(name)
  if (nameProblem) return { ok: false, error: nameProblem }
  const emailProblem = validateEmail(email)
  if (emailProblem) return { ok: false, error: emailProblem }
  if (!role) return { ok: false, error: 'Choose a role for this person.' }
  const pw = passwordProblem(password, email)
  if (pw) return { ok: false, error: `Starting password: ${pw}` }
  return { ok: true, value: { name, email, role, password } }
}

export function parseNewPassword(g: Getter, email: string): Parsed<string> {
  const password = String(g.get('password') ?? '')
  const pw = passwordProblem(password, email)
  return pw ? { ok: false, error: `New password: ${pw}` } : { ok: true, value: password }
}
