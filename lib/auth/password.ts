import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'

/**
 * Password hashing with scrypt (built into Node, so no native add-on to install).
 * Parameters follow the OWASP Password Storage Cheat Sheet: N=2^16, r=8, p=2
 * (about 64 MiB of memory per hash, which makes brute forcing expensive).
 *
 * Stored format:  scrypt$N$r$p$<salt base64>$<hash base64>
 * The parameters are stored with each hash, so they can be raised later and old
 * hashes keep working.
 */
const N = 65536
const R = 8
const P = 2
const KEY_LEN = 64
const MAX_MEM = 256 * 1024 * 1024

const derive = (password: string, salt: Buffer, n: number, r: number, p: number) =>
  new Promise<Buffer>((resolve, reject) => {
    const opts: ScryptOptions = { N: n, r, p, maxmem: MAX_MEM }
    scryptCb(password.normalize('NFKC'), salt, KEY_LEN, opts, (err, key) => (err ? reject(err) : resolve(key)))
  })

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, N, R, P)
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split('$')
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64')
  const actual = await derive(password, Buffer.from(saltB64, 'base64'), Number(n), Number(r), Number(p))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/**
 * A real hash of a random password, computed once. When a login names an unknown
 * email we still verify against this, so "no such user" takes as long as "wrong
 * password" and an attacker cannot tell which emails exist.
 */
let dummy: Promise<string> | null = null
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(16).toString('hex')))

/** Rules for NEW passwords. Length matters more than symbols (NIST SP 800-63B). */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < 12) return 'Use at least 12 characters.'
  if (password.length > 128) return 'Use at most 128 characters.'
  if (email && password.toLowerCase().includes(email.split('@')[0].toLowerCase()) && email.split('@')[0].length >= 4) {
    return 'The password must not contain your email name.'
  }
  if (/^(.)\1+$/.test(password)) return 'Choose a less repetitive password.'
  return null
}
