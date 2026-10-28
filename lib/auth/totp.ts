import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

/**
 * Time-based one-time passwords (RFC 6238), the 6-digit codes shown by Google Authenticator, Microsoft
 * Authenticator, Authy, 1Password and so on. Pure functions (no database), so every rule is unit-tested
 * against the official RFC test vectors.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const STEP_SECONDS = 30
export const DIGITS = 6

// ----------------------------------------------------------------- base32
export function base32Encode(bytes: Buffer): string {
  let bits = 0, value = 0, out = ''
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

/** Accepts spaces, dashes and lower case (people paste keys); returns null for anything that is not base32. */
export function base32Decode(text: string): Buffer | null {
  const clean = text.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '')
  if (!clean || !/^[A-Z2-7]+$/.test(clean)) return null
  let bits = 0, value = 0
  const out: number[] = []
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch); bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Buffer.from(out)
}

/** A new 160-bit secret (the size RFC 4226 recommends), as base32 text. */
export const generateSecret = () => base32Encode(randomBytes(20))

// -------------------------------------------------------------------- codes
function hotp(secret: Buffer, counter: number, digits = DIGITS): string {
  const msg = Buffer.alloc(8)
  msg.writeUInt32BE(Math.floor(counter / 2 ** 32), 0)
  msg.writeUInt32BE(counter >>> 0, 4)
  const h = createHmac('sha1', secret).update(msg).digest()
  const o = h[h.length - 1] & 15
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(bin % 10 ** digits).padStart(digits, '0')
}

export const stepOf = (nowMs: number) => Math.floor(nowMs / 1000 / STEP_SECONDS)

/** The code the authenticator app shows at `nowMs`. */
export function totpAt(secretBase32: string, nowMs: number, digits = DIGITS): string {
  const key = base32Decode(secretBase32)
  if (!key) throw new Error('Invalid TOTP secret')
  return hotp(key, stepOf(nowMs), digits)
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

/** Keeps only digits, so "123 456" and "123-456" work. */
export const cleanTotp = (input: string) => input.replace(/[\s-]/g, '').slice(0, 12)

/**
 * Checks a typed code. One step either side is accepted (phone clocks drift). Returns the time step that
 * matched, or null. A step at or before `lastUsedStep` is refused, so a code that was already used (or
 * shoulder-surfed) cannot be replayed.
 */
export function verifyTotp(secretBase32: string, code: string, nowMs: number, lastUsedStep: number | null = null): number | null {
  const clean = cleanTotp(code)
  if (!/^\d{6}$/.test(clean)) return null
  const key = base32Decode(secretBase32)
  if (!key) return null
  const now = stepOf(nowMs)
  let hit: number | null = null
  // Check every candidate (no early exit) so timing does not reveal which step matched.
  for (const step of [now - 1, now, now + 1]) {
    if (same(hotp(key, step), clean) && (lastUsedStep === null || step > lastUsedStep)) hit = hit === null ? step : Math.max(hit, step)
  }
  return hit
}

/** The text a QR code or "enter setup key" screen needs. */
export function otpauthUri(issuer: string, account: string, secretBase32: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
}

/** Groups the key in fours so it is easy to type: "ABCD EFGH ...". */
export const groupKey = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim()

// ---------------------------------------------------------- recovery codes
const RECOVERY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I confusion
export const RECOVERY_COUNT = 8

/** 8 single-use codes like "K7M2-9QXA-R4TW": the way back in if the phone is lost. */
export function generateRecoveryCodes(count = RECOVERY_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const raw = Array.from({ length: 12 }, () => RECOVERY_CHARS[randomInt(RECOVERY_CHARS.length)]).join('')
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`
  })
}

/** Upper-case, no separators: the form that is hashed and compared. */
export const normalizeRecovery = (input: string) => input.toUpperCase().replace(/[^A-Z0-9]/g, '')

/** True when the text looks like a recovery code rather than a 6-digit app code. */
export const looksLikeRecovery = (input: string) => normalizeRecovery(input).length === 12
