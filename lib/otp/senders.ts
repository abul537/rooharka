/**
 * Delivers a text message through the STORE OWNER'S OWN provider account (they are billed, not the platform).
 * Each sender returns a plain result and never throws, and error text never contains the owner's keys.
 */
import { safeFetch, type SafeResponse } from '@/lib/net/safe-fetch'
import type { SavedFields } from '@/lib/services/registry'
import type { OtpChannel } from '@/lib/otp/rules'

export type SendResult = { ok: true } | { ok: false; error: string }
type Fetch = typeof fetch
type SafeFetcher = (url: string, init: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string }) => Promise<SafeResponse>

const basic = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`

// ---------------------------------------------------------------------- Twilio
export async function sendViaTwilio(c: SavedFields, config: SavedFields, channel: OtpChannel, toE164: string, text: string, f: Fetch = fetch): Promise<SendResult> {
  const sender = channel === 'WHATSAPP' ? config.whatsappFrom : config.smsFrom
  if (!sender) return { ok: false, error: channel === 'WHATSAPP' ? 'No WhatsApp sender number is set for Twilio.' : 'No SMS sender is set for Twilio.' }
  const wa = (n: string) => (channel === 'WHATSAPP' ? `whatsapp:${n}` : n)
  const body = new URLSearchParams({ To: wa(toE164), From: wa(sender), Body: text })
  let res: Response
  try {
    res = await f(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.accountSid)}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: basic(c.accountSid, c.authToken), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
  } catch { return { ok: false, error: 'Could not reach Twilio.' } }
  if (res.status === 201 || res.status === 200) return { ok: true }
  const detail = await res.json().catch(() => ({})) as { message?: string; code?: number }
  if (res.status === 401) return { ok: false, error: 'Twilio rejected the Account SID or Auth token.' }
  return { ok: false, error: `Twilio could not send the message${detail.code ? ` (code ${detail.code})` : ''}: ${String(detail.message ?? res.status).slice(0, 160)}` }
}

// ------------------------------------------------------------------- HTTP SMS
/**
 * Fills a local SMS company's address template. Placeholders: {to} = 923001234567, {to_local} = 03001234567,
 * {message}, {secret}. Every value is URL-encoded, so a customer-controlled value can never add extra parameters.
 */
export function renderHttpSms(config: SavedFields, secret: string, toE164: string, text: string): { method: 'GET' | 'POST'; url: string; body?: string } {
  const digits = toE164.replace(/\D/g, '')
  const values: Record<string, string> = { to: digits, to_local: `0${digits.slice(2)}`, message: text, secret }
  const fill = (tpl: string) => tpl.replace(/\{(to|to_local|message|secret)\}/g, (_, k: string) => encodeURIComponent(values[k]))
  const method = config.method === 'POST' ? 'POST' : 'GET'
  return { method, url: fill(config.url), ...(method === 'POST' && config.body ? { body: fill(config.body) } : {}) }
}

export async function sendViaHttpSms(c: SavedFields, config: SavedFields, toE164: string, text: string, fetcher: SafeFetcher = safeFetch): Promise<SendResult> {
  const req = renderHttpSms(config, c.secretValue ?? '', toE164, text)
  let res: SafeResponse
  try {
    res = await fetcher(req.url, { method: req.method, ...(req.body ? { body: req.body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } } : {}) })
  } catch (e) {
    // safeFetch's own messages are about the address (not allowed / not found); anything else is the network.
    const msg = e instanceof Error ? e.message : ''
    return { ok: false, error: /address|https|allowed|found|link/i.test(msg) ? msg : 'Could not reach your SMS provider.' }
  }
  if (!res.ok) return { ok: false, error: `Your SMS provider answered with an error (status ${res.status}).` }
  if (config.successText && !res.text.toLowerCase().includes(config.successText.toLowerCase())) {
    return { ok: false, error: 'Your SMS provider did not confirm the message was sent.' }
  }
  return { ok: true }
}

export async function sendMessage(providerKey: string, c: SavedFields, config: SavedFields, channel: OtpChannel, toE164: string, text: string): Promise<SendResult> {
  if (providerKey === 'twilio') return sendViaTwilio(c, config, channel, toE164, text)
  if (providerKey === 'http-sms') return channel === 'SMS' ? sendViaHttpSms(c, config, toE164, text) : { ok: false, error: 'This provider cannot send WhatsApp messages.' }
  return { ok: false, error: 'Unknown message provider.' }
}
