import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * One master secret (APP_SECRET) protects everything sensitive the app stores or hands to browsers:
 *  - each store's own API keys (courier, SMS, image storage) are ENCRYPTED in the database,
 *  - short-lived tokens (e.g. "this phone was verified") are SIGNED so they cannot be forged.
 * Separate keys are derived from it for each purpose, so one use can never be confused with another.
 * Lose or change APP_SECRET and the stored keys become unreadable: owners would have to re-enter them.
 */
const DEV_FALLBACK = 'development-only-secret-do-not-use-in-production-0000'
let warned = false

export function appSecret(): string {
  const s = process.env.APP_SECRET
  if (s && s.length >= 32) return s
  if (process.env.NODE_ENV === 'production') {
    throw new Error('APP_SECRET is missing or shorter than 32 characters. Generate one with: openssl rand -base64 48')
  }
  if (!warned) { warned = true; console.warn('[secrets] APP_SECRET is not set; using an insecure development value. Set it in .env (see .env.example).') }
  return DEV_FALLBACK
}

const keyCache = new Map<string, Buffer>()
function deriveKey(purpose: string): Buffer {
  const secret = appSecret()
  const id = `${secret}|${purpose}`
  let k = keyCache.get(id)
  if (!k) { k = Buffer.from(hkdfSync('sha256', secret, 'rooharka', purpose, 32)); keyCache.set(id, k) }
  return k
}

// ------------------------------------------------------------------ encryption (AES-256-GCM)
export function encryptJson(value: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey('credentials'), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url')}`
}

/** Throws if the text was tampered with or was encrypted with a different APP_SECRET. */
export function decryptJson<T = unknown>(text: string): T {
  if (!text.startsWith('v1.')) throw new Error('Unknown credential format')
  const raw = Buffer.from(text.slice(3), 'base64url')
  if (raw.length < 29) throw new Error('Credential data is damaged')
  const decipher = createDecipheriv('aes-256-gcm', deriveKey('credentials'), raw.subarray(0, 12))
  decipher.setAuthTag(raw.subarray(12, 28))
  return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')) as T
}

// ------------------------------------------------------------------ signed tokens
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')

/** `payload` plus an expiry, signed. Format: base64url(json).base64url(hmac). */
export function signToken(purpose: string, payload: Record<string, unknown>, ttlSeconds: number, now = Date.now()): string {
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(now / 1000) + ttlSeconds }))
  return `${body}.${b64(createHmac('sha256', deriveKey(`token:${purpose}`)).update(body).digest())}`
}

/** The payload if the signature is valid and the token has not expired, otherwise null. */
export function verifyToken<T extends Record<string, unknown>>(purpose: string, token: string | undefined | null, now = Date.now()): (T & { exp: number }) | null {
  if (!token || token.length > 1000) return null
  const [body, sig, extra] = token.split('.')
  if (!body || !sig || extra !== undefined) return null
  const expected = createHmac('sha256', deriveKey(`token:${purpose}`)).update(body).digest()
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { exp: number }
    return typeof payload.exp === 'number' && payload.exp * 1000 > now ? payload : null
  } catch { return null }
}

/** Keyed hash (e.g. of a one-time code): useless without APP_SECRET, even if the database leaks. */
export function hmacHex(purpose: string, data: string): string {
  return createHmac('sha256', deriveKey(`hmac:${purpose}`)).update(data).digest('hex')
}

/** "••••1234": what the settings page shows instead of a saved secret. */
export function maskSecret(value: string | undefined | null): string {
  if (!value) return ''
  return value.length <= 4 ? '••••' : `••••${value.slice(-4)}`
}
