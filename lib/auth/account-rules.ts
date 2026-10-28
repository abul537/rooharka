import { passwordProblem } from '@/lib/auth/password'

export interface PasswordChangeInput { current: string; next: string; confirm: string; email: string }

/**
 * The checks for "change my password", in the order a person would fix them. Returns the first problem
 * (a sentence safe to show) or null when the request is acceptable. The current password itself is verified
 * against the database elsewhere; this is only about the shape of the new one.
 */
export function passwordChangeProblem(i: PasswordChangeInput): string | null {
  if (!i.current) return 'Enter your current password.'
  if (!i.next) return 'Enter a new password.'
  if (i.next !== i.confirm) return 'The two new passwords do not match.'
  if (i.next === i.current) return 'The new password must be different from the current one.'
  return passwordProblem(i.next, i.email)
}
