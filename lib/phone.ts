/**
 * Pakistani mobile numbers are typed as 03XXXXXXXXX but STORED in international
 * format (+923XXXXXXXXX). One canonical form means the same customer is never
 * saved twice and couriers / SMS providers get what they expect.
 */
export function normalizePkMobile(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, '')
  if (/^03\d{9}$/.test(digits)) return `+92${digits.slice(1)}`
  if (/^\+923\d{9}$/.test(digits)) return digits
  if (/^923\d{9}$/.test(digits)) return `+${digits}`
  return null
}

export const lastFour = (phone: string) => phone.replace(/\D/g, '').slice(-4)

/** "Ali Raza" -> "Ali R." Shown on the public tracking page instead of the full name. */
export function maskedName(fullName: string): string {
  const [first = '', ...rest] = fullName.trim().split(/\s+/)
  const initial = rest.length ? ` ${rest[rest.length - 1][0].toUpperCase()}.` : ''
  return `${first}${initial}`
}
