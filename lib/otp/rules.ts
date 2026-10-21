/**
 * Phone verification (OTP) rules. Pure logic, no database or network, so every rule is unit-tested.
 *
 * How the gate works:
 *   1. The store owner switches "Verify phone numbers" on in Settings and connects THEIR OWN SMS or
 *      WhatsApp account (they pay their provider; the platform pays nothing).
 *   2. A customer who presses Buy lands on /verify, receives a code, enters it.
 *   3. The server then gives the browser a signed, short-lived "this phone was verified" cookie.
 *   4. /checkout will not open without it, and POST /api/orders REJECTS orders without it, so the
 *      gate cannot be skipped by calling the API directly. The order's phone must be the verified one.
 */
import { randomInt } from 'node:crypto'
import { hmacHex, verifyToken } from '@/lib/secrets'
import type { Getter, Parsed } from '@/lib/admin/settings-rules'
import type { ServiceView } from '@/lib/services/registry'
import { serviceDef } from '@/lib/services/registry'

export type OtpChannel = 'SMS' | 'WHATSAPP'

export const OTP_COOKIE = 'rk_pv'
/** How long a verified phone stays valid for placing an order. */
export const VERIFIED_MINUTES = 30
/** Minimum wait between two codes to the same number (stops SMS bombing and protects the owner's balance). */
export const RESEND_COOLDOWN_SECONDS = 60
/** Codes one number may request per hour. */
export const MAX_SENDS_PER_PHONE_PER_HOUR = 5

export interface OtpSettings {
  enabled: boolean
  channel: OtpChannel
  length: number
  expiryMinutes: number
  maxAttempts: number
  dailyLimit: number
}

export const DEFAULT_OTP_SETTINGS: OtpSettings = { enabled: false, channel: 'SMS', length: 6, expiryMinutes: 5, maxAttempts: 5, dailyLimit: 200 }

/** Empty -> the default; digits -> the number; anything else -> NaN (refused, never silently replaced). */
const num = (v: FormDataEntryValue | null, fallback: number) => { const s = String(v ?? '').trim(); return s === '' ? fallback : /^\d{1,6}$/.test(s) ? Number(s) : NaN }
const inRange = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi

export function parseOtpSettings(g: Getter): Parsed<OtpSettings> {
  const channel = String(g.get('otpChannel') ?? '') === 'WHATSAPP' ? 'WHATSAPP' : 'SMS'
  const length = num(g.get('otpLength'), 6)
  if (!inRange(length, 4, 8)) return { ok: false, error: 'The code length must be from 4 to 8 digits.' }
  const expiryMinutes = num(g.get('otpExpiryMinutes'), 5)
  if (!inRange(expiryMinutes, 1, 30)) return { ok: false, error: 'A code must stay valid for 1 to 30 minutes.' }
  const maxAttempts = num(g.get('otpMaxAttempts'), 5)
  if (!inRange(maxAttempts, 1, 10)) return { ok: false, error: 'Wrong-code attempts must be from 1 to 10.' }
  const dailyLimit = num(g.get('otpDailyLimit'), 200)
  if (!inRange(dailyLimit, 1, 5000)) return { ok: false, error: 'The daily message limit must be from 1 to 5000.' }
  return { ok: true, value: { enabled: g.get('phoneVerificationEnabled') === 'on', channel, length, expiryMinutes, maxAttempts, dailyLimit } }
}

// ----------------------------------------------------------------- providers
/** Which connected service delivers codes on this channel. Twilio does both; the HTTP gateway only does SMS. */
const CHANNELS: Record<string, OtpChannel[]> = { twilio: ['SMS', 'WHATSAPP'], 'http-sms': ['SMS'] }

/**
 * The provider to use, or a reason there is none (shown to the owner when they try to switch the gate on,
 * so the gate can never be "on" with nothing behind it).
 */
export function resolveProvider(views: Iterable<ServiceView>, channel: OtpChannel): { key: string } | { problem: string } {
  const usable = [...views].filter((v) => v.enabled && v.configured && serviceDef(v.key)?.type === 'MESSAGING' && CHANNELS[v.key]?.includes(channel))
  // Twilio needs the matching sender number for the channel.
  const ready = usable.filter((v) => v.key !== 'twilio' || (channel === 'SMS' ? v.values.smsFrom : v.values.whatsappFrom))
  if (ready.length === 0) {
    if (channel === 'WHATSAPP') return { problem: 'WhatsApp codes need Twilio connected, switched on and with a WhatsApp sender number. Connect it below first.' }
    return { problem: 'Connect an SMS provider below (Twilio, or your local SMS company) and switch it on first.' }
  }
  return { key: (ready.find((v) => v.isDefault) ?? ready[0]).key }
}

// --------------------------------------------------------------------- codes
export function generateCode(length: number, rand: (max: number) => number = (m) => randomInt(m)): string {
  let out = ''
  for (let i = 0; i < length; i++) out += String(rand(10))
  return out
}

/** Keyed hash: the database never holds a usable code, and one phone's code cannot be replayed for another. */
export const hashCode = (storeId: string, phone: string, code: string) => hmacHex('otp', `${storeId}|${phone}|${code}`)

export function messageText(storeName: string, code: string, expiryMinutes: number): string {
  const name = storeName.replace(/[^\p{L}\p{N} .&'-]/gu, '').trim().slice(0, 30) || 'Store'
  return `${code} is your ${name} verification code. It is valid for ${expiryMinutes} minutes. Do not share it with anyone.`
}

// -------------------------------------------------------------- send decision
export interface SendHistory {
  /** When the latest code to this number was sent. */
  lastSentAt: Date | null
  sentLastHour: number
  /** Codes sent by the whole store today (the owner's cost cap). */
  sentToday: number
}
export type SendDecision = { ok: true } | { ok: false; reason: 'COOLDOWN' | 'PHONE_LIMIT' | 'DAILY_LIMIT'; message: string; retryAfterSeconds?: number }

export function decideSend(h: SendHistory, s: Pick<OtpSettings, 'dailyLimit'>, now = new Date()): SendDecision {
  if (h.sentToday >= s.dailyLimit) {
    return { ok: false, reason: 'DAILY_LIMIT', message: 'Verification is temporarily unavailable. Please try again later or contact the store.' }
  }
  if (h.lastSentAt) {
    const wait = RESEND_COOLDOWN_SECONDS - Math.floor((now.getTime() - h.lastSentAt.getTime()) / 1000)
    if (wait > 0) return { ok: false, reason: 'COOLDOWN', retryAfterSeconds: wait, message: `Please wait ${wait} seconds before asking for a new code.` }
  }
  if (h.sentLastHour >= MAX_SENDS_PER_PHONE_PER_HOUR) {
    return { ok: false, reason: 'PHONE_LIMIT', message: 'Too many codes were requested for this number. Please try again in an hour.' }
  }
  return { ok: true }
}

// ------------------------------------------------------------ verify decision
export interface PendingCode { codeHash: string; attempts: number; expiresAt: Date; verifiedAt: Date | null }
export type VerifyDecision =
  | { ok: true }
  | { ok: false; reason: 'NO_CODE' | 'EXPIRED' | 'LOCKED' | 'WRONG'; message: string; attemptsLeft?: number }

/** `latest` is the most recent code for the number; older codes are dead as soon as a new one is sent. */
export function decideVerify(latest: PendingCode | null, submittedHash: string, maxAttempts: number, now = new Date(), equal: (a: string, b: string) => boolean): VerifyDecision {
  if (!latest || latest.verifiedAt) return { ok: false, reason: 'NO_CODE', message: 'Please ask for a new code.' }
  if (latest.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'EXPIRED', message: 'This code has expired. Please ask for a new one.' }
  if (latest.attempts >= maxAttempts) return { ok: false, reason: 'LOCKED', message: 'Too many wrong attempts. Please ask for a new code.' }
  if (!equal(latest.codeHash, submittedHash)) {
    const left = maxAttempts - latest.attempts - 1
    return { ok: false, reason: 'WRONG', attemptsLeft: Math.max(0, left), message: left > 0 ? `That code is not correct. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'That code is not correct. Please ask for a new code.' }
  }
  return { ok: true }
}

/** Accepts only the digits a code can contain, so odd input never reaches the hash or the database. */
export const cleanCode = (v: unknown, length: number): string | null => {
  const s = typeof v === 'string' ? v.replace(/\s/g, '') : ''
  return new RegExp(`^\\d{${length}}$`).test(s) ? s : null
}

// ------------------------------------------------------- verified-phone cookie
/** True when this browser's cookie proves THIS phone was verified for THIS store. */
export function isPhoneVerified(cookieValue: string | undefined | null, storeId: string, phone: string): boolean {
  const t = verifyToken<{ s?: string; p?: string }>('phone', cookieValue)
  return !!t && t.s === storeId && t.p === phone
}

/** The verified phone (+92…) in a cookie, if the cookie is valid for this store. */
export function verifiedPhone(cookieValue: string | undefined | null, storeId: string): string | null {
  const t = verifyToken<{ s?: string; p?: string }>('phone', cookieValue)
  return t && t.s === storeId && typeof t.p === 'string' ? t.p : null
}

