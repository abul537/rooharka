import { normalizeCode, validCode } from '@/lib/offers/rules'
/**
 * Pure rules for store-owner sign-up (no database), so every rule is unit-tested.
 * The browser form checks the same things for convenience, but THESE run on the server and are what counts.
 */
import { createHash, randomBytes } from 'node:crypto'
import type { Getter, Parsed } from '@/lib/admin/settings-rules'
import { passwordProblem } from '@/lib/auth/password'
import { normalizePkMobile } from '@/lib/phone'
import { validateEmail } from '@/lib/validation'
import { isValidSlug } from '@/lib/csmi/rules'

export const TERMS_VERSION = '2026-11'
export const REQUEST_HOURS = 24

/** Names a store may never take: they would clash with our own pages, web addresses or look official. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'www', 'admin', 'administrator', 'csmi', 'api', 'app', 'apps', 'mail', 'email', 'smtp', 'imap', 'pop', 'ftp', 'ns1', 'ns2', 'dns', 'cdn', 'static', 'assets', 'media', 'img', 'images',
  'shop', 'shops', 'store', 'stores', 'help', 'support', 'billing', 'pay', 'payments', 'login', 'logout', 'signin', 'signup', 'register', 'account', 'accounts', 'dashboard', 'panel',
  'pricing', 'features', 'terms', 'privacy', 'about', 'contact', 'blog', 'docs', 'status', 'security', 'root', 'system', 'platform', 'rooharka', 'staging', 'test', 'demo', 'dev', 'beta',
  'official', 'verify', 'checkout', 'track', 'tracking', 'cart', 'orders', 'webhook', 'webhooks', 'cron', 'jazzcash', 'easypaisa', 'tcs', 'postex', 'leopards', 'shopify', 'daraz',
])

/** "Ali's Fashion Store!" -> "alis-fashion-store". Empty when nothing usable is left. */
export function slugFromName(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/g, '')
}

/** Why a store address cannot be used, or null if it is fine. (Whether someone ELSE already has it is checked in the database.) */
export function slugProblem(slug: string): string | null {
  if (slug.length < 3 || slug.length > 30) return 'The store address must be 3 to 30 characters.'
  if (!isValidSlug(slug) || slug.includes('--')) return 'Use only lowercase letters, digits and single dashes, starting and ending with a letter or digit.'
  if (RESERVED_SLUGS.has(slug)) return 'That address is reserved. Please choose another.'
  return null
}

export interface SignupInput {
  ownerName: string; email: string; phone: string; storeName: string; slug: string
  planId: string; interval: 'MONTHLY' | 'YEARLY'; password: string
  /** An optional promotion code, already normalised; checked against the offers table by the service. */
  offerCode: string | null
}

const text = (g: Getter, k: string) => String(g.get(k) ?? '').trim()

/** Honeypot: a field real people never see. Bots fill it. */
export const HONEYPOT_FIELD = 'website'

/**
 * Parses the sign-up form. One readable message per mistake. The password is returned as typed (it is hashed by the
 * caller and never stored or logged); it is checked with the same strength rules as every other password.
 */
export function parseSignupForm(g: Getter): Parsed<SignupInput> {
  if (text(g, HONEYPOT_FIELD)) return { ok: false, error: 'We could not process this request.' }
  const ownerName = text(g, 'ownerName').replace(/\s+/g, ' ')
  if (ownerName.length < 2 || ownerName.length > 60 || !/^[\p{L}\p{M}\s.'’-]+$/u.test(ownerName)) return { ok: false, error: 'Enter your full name (letters only, 2 to 60 characters).' }

  const email = text(g, 'email').toLowerCase()
  if (validateEmail(email) || email.length > 254) return { ok: false, error: 'Enter a valid email address.' }

  const phone = normalizePkMobile(text(g, 'phone'))
  if (!phone) return { ok: false, error: 'Enter a valid Pakistani mobile number, like 0300 1234567.' }

  const storeName = text(g, 'storeName').replace(/\s+/g, ' ')
  if (storeName.length < 2 || storeName.length > 50 || /[<>]/.test(storeName)) return { ok: false, error: 'The store name must be 2 to 50 characters.' }

  const slug = text(g, 'slug').toLowerCase()
  const sp = slugProblem(slug)
  if (sp) return { ok: false, error: sp }

  const planId = text(g, 'planId')
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(planId)) return { ok: false, error: 'Choose a plan.' }
  const interval = text(g, 'interval') === 'YEARLY' ? 'YEARLY' : 'MONTHLY'

  const offerRaw = text(g, 'offerCode')
  const offerCode = offerRaw ? normalizeCode(offerRaw) : null
  if (offerCode !== null && !validCode(offerCode)) return { ok: false, error: 'That offer code is not valid.' }

  const password = String(g.get('password') ?? '')
  const pp = passwordProblem(password, email)
  if (pp) return { ok: false, error: pp }

  if (g.get('terms') !== 'on') return { ok: false, error: 'Please accept the Terms of Service and Privacy Policy to continue.' }
  return { ok: true, value: { ownerName, email, phone, storeName, slug, planId, interval, password, offerCode } }
}

// -------------------------------------------------------------------- tokens
export const hashToken = (secret: string) => createHash('sha256').update(secret).digest('hex')

/** The emailed link carries `<requestId>.<secret>`; only the secret's hash is stored. */
export function newVerifyToken(requestId: string): { token: string; hash: string } {
  const secret = randomBytes(32).toString('base64url')
  return { token: `${requestId}.${secret}`, hash: hashToken(secret) }
}
export function splitVerifyToken(token: string): { id: string; secret: string } | null {
  if (typeof token !== 'string' || token.length > 200) return null
  const m = /^([A-Za-z0-9_-]{8,40})\.([A-Za-z0-9_-]{32,64})$/.exec(token)
  return m ? { id: m[1], secret: m[2] } : null
}

export const requestExpiry = (now = new Date()) => new Date(now.getTime() + REQUEST_HOURS * 3_600_000)
export const trialEnd = (now: Date, days: number) => new Date(now.getTime() + days * 86_400_000)

// ----------------------------------------------------------------- gatekeeping
export interface GateSettings { signupsOpen: boolean; dailyCap: number }
/** May a new sign-up start right now? `startedToday` counts today's requests (Pakistan day). */
export function signupGate(s: GateSettings, startedToday: number): { ok: true } | { ok: false; error: string } {
  if (!s.signupsOpen) return { ok: false, error: 'Sign-ups are closed at the moment. Please check back soon or contact us.' }
  if (startedToday >= s.dailyCap) return { ok: false, error: 'We are receiving a lot of sign-ups today. Please try again tomorrow or contact us.' }
  return { ok: true }
}

export type SignupMode = 'EMAIL' | 'APPROVAL'
/**
 * How a verified-or-not request becomes a store.
 *  - mail works and the owner does not want approvals: the person verifies their email, the store is created at once;
 *  - mail works and approvals are on: the email is verified, then the owner approves in CSMI;
 *  - mail is not set up: the email cannot be checked, so the owner MUST approve (and can phone the person first).
 */
export function signupMode(mailWorks: boolean): SignupMode { return mailWorks ? 'EMAIL' : 'APPROVAL' }
export const needsApproval = (mailWorks: boolean, requireApproval: boolean) => !mailWorks || requireApproval
