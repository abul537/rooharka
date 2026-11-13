/** Checks the pasted token before anything is sent anywhere. Pure, tested. */
export const MAX_TOKEN_LENGTH = 600
export function parseToken(raw: unknown): { ok: true; token: string } | { ok: false; error: string } {
  // People paste with a trailing space or newline; that is not a mistake worth an error.
  const token = (typeof raw === 'string' ? raw : '').trim()
  if (!token) return { ok: false, error: 'Paste your PostEx API token first.' }
  if (token.length < 8 || token.length > MAX_TOKEN_LENGTH || /\s/.test(token) || /[^\x21-\x7e]/.test(token)) return { ok: false, error: 'We couldn’t verify this token. Please check you copied it correctly.' }
  return { ok: true, token }
}
