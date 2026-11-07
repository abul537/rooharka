import type { Getter, Parsed } from '@/lib/admin/settings-rules'
import { normalizePkMobile } from '@/lib/phone'
import { validateEmail } from '@/lib/validation'

/** What the platform owner controls from CSMI. Pure parsing, so every limit is tested. Stored as one JSON row. */
export interface PlatformSettings {
  /** Master switch. Starts CLOSED: nobody can sign up until the owner opens it on purpose. */
  signupsOpen: boolean
  /** Even when email works, the owner approves each new store himself. */
  requireApproval: boolean
  /** New stores start with their shop CLOSED to customers until the owner opens it (the go-live gate). */
  requireShopApproval: boolean
  trialDays: number
  /** Most new sign-ups accepted per day (Pakistan time): a brake against floods. */
  dailyCap: number
  brandName: string
  supportEmail: string
  supportWhatsapp: string
  /** Shown to store owners on their Billing page: how to pay the platform. */
  paymentInstructions: string
  /** One short line shown above the public site; empty = none. */
  announcement: string
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  signupsOpen: false, requireApproval: false, requireShopApproval: false, trialDays: 14, dailyCap: 20, brandName: 'Rooharka',
  supportEmail: '', supportWhatsapp: '', paymentInstructions: '', announcement: '',
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const int = (v: unknown, min: number, max: number, fallback: number) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback)

/** Reads the saved JSON defensively: anything missing or wrong falls back to the safe default. */
export function readSettings(value: unknown): PlatformSettings {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const d = DEFAULT_SETTINGS
  return {
    signupsOpen: v.signupsOpen === true, requireApproval: v.requireApproval === true, requireShopApproval: v.requireShopApproval === true,
    trialDays: int(v.trialDays, 0, 90, d.trialDays), dailyCap: int(v.dailyCap, 1, 1000, d.dailyCap),
    brandName: str(v.brandName, 40) || d.brandName, supportEmail: str(v.supportEmail, 120), supportWhatsapp: str(v.supportWhatsapp, 20),
    paymentInstructions: str(v.paymentInstructions, 1000), announcement: str(v.announcement, 160),
  }
}

const text = (g: Getter, k: string) => String(g.get(k) ?? '').trim()
const whole = (s: string) => (/^\d{1,5}$/.test(s) ? Number(s) : NaN)

export function parseSettingsForm(g: Getter): Parsed<PlatformSettings> {
  const trialDays = whole(text(g, 'trialDays'))
  if (!(trialDays >= 0 && trialDays <= 90)) return { ok: false, error: 'Trial days must be a whole number from 0 to 90.' }
  const dailyCap = whole(text(g, 'dailyCap'))
  if (!(dailyCap >= 1 && dailyCap <= 1000)) return { ok: false, error: 'The daily sign-up limit must be a whole number from 1 to 1000.' }
  const brandName = text(g, 'brandName')
  if (brandName.length < 2 || brandName.length > 40) return { ok: false, error: 'The brand name must be 2 to 40 characters.' }
  const supportEmail = text(g, 'supportEmail')
  if (supportEmail && (validateEmail(supportEmail) || supportEmail.length > 120)) return { ok: false, error: 'The support email is not valid.' }
  const wa = text(g, 'supportWhatsapp')
  const supportWhatsapp = wa ? normalizePkMobile(wa) : ''
  if (wa && !supportWhatsapp) return { ok: false, error: 'The WhatsApp number must be a Pakistani mobile, like 0300 1234567.' }
  const paymentInstructions = text(g, 'paymentInstructions')
  if (paymentInstructions.length > 1000) return { ok: false, error: 'The payment instructions are too long (1000 characters at most).' }
  const announcement = text(g, 'announcement')
  if (announcement.length > 160) return { ok: false, error: 'The announcement must be 160 characters or fewer.' }
  return { ok: true, value: { signupsOpen: g.get('signupsOpen') === 'on', requireApproval: g.get('requireApproval') === 'on', requireShopApproval: g.get('requireShopApproval') === 'on', trialDays, dailyCap, brandName, supportEmail, supportWhatsapp: supportWhatsapp ?? '', paymentInstructions, announcement } }
}
