import type { SavedFields } from '@/lib/services/registry'
import { ADAPTERS } from '@/lib/couriers/adapters'

export type TestResult = { ok: true; message: string } | { ok: false; error: string }
type Fetch = typeof fetch
const basic = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`

async function call(f: Fetch, url: string, init: RequestInit): Promise<Response | TestResult> {
  try { return await f(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10_000) }) }
  catch { return { ok: false, error: 'Could not reach the service. Check your internet connection and try again.' } }
}
const isResult = (v: Response | TestResult): v is TestResult => 'ok' in v && typeof (v as TestResult).ok === 'boolean' && !('status' in v)

/** Checks that a store's credentials are accepted by the provider, without sending anything or spending money. */
export async function testConnection(key: string, c: SavedFields, config: SavedFields, f: Fetch = fetch): Promise<TestResult> {
  switch (key) {
    case 'cloudinary': {
      const r = await call(f, `https://api.cloudinary.com/v1_1/${encodeURIComponent(c.cloudName)}/ping`, { headers: { Authorization: basic(c.apiKey, c.apiSecret) } })
      if (isResult(r)) return r
      if (r.ok) return { ok: true, message: 'Connected to Cloudinary.' }
      return { ok: false, error: r.status === 401 || r.status === 403 ? 'Cloudinary rejected the cloud name, API key or API secret.' : `Cloudinary answered with an error (${r.status}).` }
    }
    case 'twilio': {
      const r = await call(f, `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.accountSid)}.json`, { headers: { Authorization: basic(c.accountSid, c.authToken) } })
      if (isResult(r)) return r
      if (r.ok) return { ok: true, message: 'Connected to Twilio.' }
      return { ok: false, error: r.status === 401 ? 'Twilio rejected the Account SID or Auth token.' : `Twilio answered with an error (${r.status}).` }
    }
    case 'postex':
    case 'leopards':
      return ADAPTERS[key].check(c, config, f) // read-only: nothing is booked
    default:
      return { ok: false, error: 'This service is tested by sending a real message or booking; use its own test button.' }
  }
}
