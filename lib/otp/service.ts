import { timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'
import { hmacHex, signToken } from '@/lib/secrets'
import { normalizePkMobile } from '@/lib/phone'
import { loadServiceViews, getServiceSecrets, recordServiceResult } from '@/lib/services/store-services'
import { sendMessage } from '@/lib/otp/senders'
import {
  OTP_COOKIE, VERIFIED_MINUTES, cleanCode, decideSend, decideVerify, generateCode, hashCode, isPhoneVerified, messageText, resolveProvider, verifiedPhone,
  type OtpSettings,
} from '@/lib/otp/rules'

export type OtpFailure = { ok: false; status: number; error: string; retryAfterSeconds?: number }

/** `__Host-` cookies must be Secure, which needs https: so only in production. */
export const otpCookieName = () => (process.env.NODE_ENV === 'production' ? `__Host-${OTP_COOKIE}` : OTP_COOKIE)
export const otpCookieOptions = () => ({
  httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: VERIFIED_MINUTES * 60,
})

export async function loadOtpSettings(storeId: string): Promise<(OtpSettings & { storeName: string }) | null> {
  const s = await db.storeSettings.findUnique({
    where: { storeId },
    select: { phoneVerificationEnabled: true, otpChannel: true, otpLength: true, otpExpiryMinutes: true, otpMaxAttempts: true, otpDailyLimit: true, displayName: true },
  })
  if (!s) return null
  return { enabled: s.phoneVerificationEnabled, channel: s.otpChannel, length: s.otpLength, expiryMinutes: s.otpExpiryMinutes, maxAttempts: s.otpMaxAttempts, dailyLimit: s.otpDailyLimit, storeName: s.displayName }
}

export { isPhoneVerified, verifiedPhone }

const sending = new Set<string>() // two clicks at once must not send two (paid) messages

export async function sendOtp(store: { id: string }, phoneRaw: unknown, ip: string): Promise<{ ok: true; length: number; expiresInSeconds: number } | OtpFailure> {
  const phone = typeof phoneRaw === 'string' ? normalizePkMobile(phoneRaw.trim()) : null
  if (!phone) return { ok: false, status: 400, error: 'Please enter a valid Pakistani mobile number (03XXXXXXXXX).' }

  const settings = await loadOtpSettings(store.id)
  if (!settings?.enabled) return { ok: false, status: 400, error: 'Verification is not needed for this store.' }

  const lockKey = `${store.id}|${phone}`
  if (sending.has(lockKey)) return { ok: false, status: 429, error: 'A code is already being sent. Please wait a moment.', retryAfterSeconds: 5 }
  sending.add(lockKey)
  try {
    const now = new Date()
    const [blocked, views, last, hour, today] = await Promise.all([
      db.blocklistEntry.findFirst({ where: { storeId: store.id, OR: [{ type: 'PHONE', value: phone }, { type: 'IP', value: ip }] }, select: { id: true } }),
      loadServiceViews(store.id),
      db.phoneVerification.findFirst({ where: { storeId: store.id, phone }, orderBy: { sentAt: 'desc' }, select: { sentAt: true } }),
      db.phoneVerification.count({ where: { storeId: store.id, phone, sentAt: { gt: new Date(now.getTime() - 3_600_000) } } }),
      db.phoneVerification.count({ where: { storeId: store.id, sentAt: { gt: new Date(now.getTime() - 86_400_000) } } }),
    ])
    // A blocked number is not told why, and costs the owner nothing.
    if (blocked) return { ok: false, status: 403, error: 'We cannot verify this number. Please contact the store.' }

    const provider = resolveProvider(views.values(), settings.channel)
    if ('problem' in provider) {
      console.error('[otp] gate is on but no provider is ready for store', store.id, provider.problem)
      return { ok: false, status: 503, error: 'Verification is temporarily unavailable. Please contact the store.' }
    }

    const decision = decideSend({ lastSentAt: last?.sentAt ?? null, sentLastHour: hour, sentToday: today }, settings, now)
    if (!decision.ok) return { ok: false, status: 429, error: decision.message, retryAfterSeconds: decision.retryAfterSeconds }

    const secrets = await getServiceSecrets(store.id, provider.key)
    if (!secrets) return { ok: false, status: 503, error: 'Verification is temporarily unavailable. Please contact the store.' }

    const code = generateCode(settings.length)
    const row = await db.phoneVerification.create({
      data: {
        storeId: store.id, phone, channel: settings.channel, codeHash: hashCode(store.id, phone, code),
        expiresAt: new Date(now.getTime() + settings.expiryMinutes * 60_000), ipHash: hmacHex('ip', ip),
      },
      select: { id: true },
    })
    const sent = await sendMessage(provider.key, secrets.credentials, secrets.config, settings.channel, phone, messageText(settings.storeName, code, settings.expiryMinutes))
    if (!sent.ok) {
      // Nothing reached the customer: forget this code (it must not eat their resend cooldown) and show the owner the reason.
      await db.phoneVerification.delete({ where: { id: row.id } }).catch(() => undefined)
      await recordServiceResult(store.id, provider.key, sent.error).catch(() => undefined)
      console.error('[otp] send failed', provider.key, sent.error)
      return { ok: false, status: 502, error: 'We could not send the code right now. Please try again in a minute.' }
    }
    await recordServiceResult(store.id, provider.key, null).catch(() => undefined)
    return { ok: true, length: settings.length, expiresInSeconds: settings.expiryMinutes * 60 }
  } finally {
    sending.delete(lockKey)
  }
}

const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

export async function verifyOtp(store: { id: string }, phoneRaw: unknown, codeRaw: unknown): Promise<{ ok: true; token: string; phone: string } | OtpFailure> {
  const phone = typeof phoneRaw === 'string' ? normalizePkMobile(phoneRaw.trim()) : null
  if (!phone) return { ok: false, status: 400, error: 'Please enter a valid Pakistani mobile number (03XXXXXXXXX).' }
  const settings = await loadOtpSettings(store.id)
  if (!settings?.enabled) return { ok: false, status: 400, error: 'Verification is not needed for this store.' }
  const code = cleanCode(codeRaw, settings.length)
  if (!code) return { ok: false, status: 400, error: `Enter the ${settings.length}-digit code.` }

  const now = new Date()
  const latest = await db.phoneVerification.findFirst({ where: { storeId: store.id, phone }, orderBy: { sentAt: 'desc' } })
  const decision = decideVerify(latest, hashCode(store.id, phone, code), settings.maxAttempts, now, sameHash)
  if (!decision.ok && decision.reason !== 'WRONG') return { ok: false, status: decision.reason === 'LOCKED' ? 429 : 400, error: decision.message }

  // Spend one attempt ATOMICALLY before looking at the answer: parallel guesses cannot beat the limit.
  const claimed = await db.phoneVerification.updateMany({
    where: { id: latest!.id, verifiedAt: null, attempts: { lt: settings.maxAttempts }, expiresAt: { gt: now } },
    data: { attempts: { increment: 1 } },
  })
  if (claimed.count === 0) return { ok: false, status: 429, error: 'Too many wrong attempts. Please ask for a new code.' }
  if (!decision.ok) return { ok: false, status: 400, error: decision.message }

  const done = await db.phoneVerification.updateMany({ where: { id: latest!.id, verifiedAt: null }, data: { verifiedAt: now } })
  if (done.count === 0) return { ok: false, status: 400, error: 'Please ask for a new code.' }
  return { ok: true, phone, token: signToken('phone', { s: store.id, p: phone }, VERIFIED_MINUTES * 60) }
}

export async function saveOtpSettings(storeId: string, v: OtpSettings) {
  await db.storeSettings.update({
    where: { storeId },
    data: { phoneVerificationEnabled: v.enabled, otpChannel: v.channel, otpLength: v.length, otpExpiryMinutes: v.expiryMinutes, otpMaxAttempts: v.maxAttempts, otpDailyLimit: v.dailyLimit },
  })
}

/** Lets the owner prove their provider works (one real message, billed to them) before customers depend on it. */
export async function sendTestMessage(storeId: string, phoneRaw: unknown, channel: 'SMS' | 'WHATSAPP'): Promise<{ ok: true } | { ok: false; error: string }> {
  const phone = typeof phoneRaw === 'string' ? normalizePkMobile(phoneRaw.trim()) : null
  if (!phone) return { ok: false, error: 'Enter your own mobile number like 03001234567.' }
  const [views, settings] = await Promise.all([loadServiceViews(storeId), db.storeSettings.findUnique({ where: { storeId }, select: { displayName: true } })])
  const provider = resolveProvider(views.values(), channel)
  if ('problem' in provider) return { ok: false, error: provider.problem }
  const secrets = await getServiceSecrets(storeId, provider.key)
  if (!secrets) return { ok: false, error: 'Your provider details could not be read. Save them again.' }
  const sent = await sendMessage(provider.key, secrets.credentials, secrets.config, channel, phone, `Test from ${settings?.displayName ?? 'your store'}: your verification messages are working.`)
  await recordServiceResult(storeId, provider.key, sent.ok ? null : sent.error).catch(() => undefined)
  return sent.ok ? { ok: true } : { ok: false, error: sent.error }
}
