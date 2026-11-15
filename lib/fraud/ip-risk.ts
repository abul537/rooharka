/**
 * IP RISK SCORE from IPQualityScore, through the STORE'S OWN account (the store owner pays IPQualityScore; the
 * platform is only the bridge). Asked only for orders above the store's value limit.
 *
 * Failure rules: a timeout, a refusal or a reply we cannot read means "not checked" (null). It never throws,
 * never delays the customer (it runs after checkout has answered) and the key never appears in a log.
 */
import type { IpRisk } from '@/lib/fraud/rules'

type Fetch = typeof fetch
export const IPQS_KEY = /^[A-Za-z0-9]{24,64}$/

/** Reads the service's answer strictly: only a real 0 to 100 score from a successful reply is believed. */
export function readIpqsReply(raw: unknown): IpRisk | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const score = o.fraud_score
  if (o.success !== true || typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) return null
  return {
    score: Math.round(score),
    proxy: o.proxy === true || o.vpn === true || o.tor === true,
    country: typeof o.country_code === 'string' && /^[A-Z]{2}$/.test(o.country_code) ? o.country_code : null,
  }
}

/** A public IPv4 or IPv6 address (not a home network, not this computer): the only kind worth asking about. */
export function publicIp(ip: string | null | undefined): string | null {
  const v = (ip ?? '').trim()
  if (/^(\d{1,3})(\.\d{1,3}){3}$/.test(v)) {
    const p = v.split('.').map(Number)
    if (p.some((n) => n > 255) || p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 169 && p[1] === 254) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127)) return null
    return v
  }
  if (/^[0-9a-f:]{3,45}$/i.test(v) && v.includes(':') && !/^(::1|fe80|fc|fd)/i.test(v)) return v
  return null
}

export async function ipRisk(apiKey: string, ip: string, f: Fetch = fetch): Promise<IpRisk | null> {
  const address = publicIp(ip)
  if (!IPQS_KEY.test(apiKey) || !address) return null
  // Lenient settings on purpose: Pakistani mobile networks share one address among many phones, and a strict
  // reading would hold honest buyers.
  const url = `https://www.ipqualityscore.com/api/json/ip/${apiKey}/${encodeURIComponent(address)}?strictness=0&allow_public_access_points=true&lighter_penalties=true&mobile=true`
  try {
    const r = await f(url, { redirect: 'error', signal: AbortSignal.timeout(5_000), cache: 'no-store' })
    if (!r.ok) { console.warn('[ip risk] the service answered', r.status); return null }
    return readIpqsReply(await r.json())
  } catch (e) {
    console.warn('[ip risk] not checked:', e instanceof Error ? e.name : 'error') // never the URL: it contains the key
    return null
  }
}
