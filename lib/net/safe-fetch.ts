import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * Store owners type web addresses that OUR SERVER then calls (their SMS provider). Without checks, someone
 * could point it at internal addresses (this server's own network, cloud metadata) and read the reply.
 * Only public https addresses are allowed, redirects are refused, and time and size are limited.
 */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase()
    if (v === '::1' || v === '::' || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('fc') || v.startsWith('fd')) return true
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    return mapped ? isPrivateAddress(mapped[1]) : false
  }
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true // unparseable: refuse
  const [a, b] = p
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224
}

/** Throws a readable Error unless `raw` is an https address on the public internet. */
export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('The address is not a valid web link.') }
  if (url.protocol !== 'https:') throw new Error('The address must start with https://')
  if (url.username || url.password) throw new Error('The address must not contain a username or password.')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('That address is not allowed.')
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('That address is not allowed.')
    return url
  }
  let addrs: { address: string }[]
  try { addrs = await lookup(host, { all: true }) } catch { throw new Error('That web address could not be found.') }
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) throw new Error('That address is not allowed.')
  return url
}

export interface SafeResponse { status: number; ok: boolean; text: string }

/** fetch() for owner-supplied addresses: public https only, no redirects, 10 s limit, 64 KB reply cap. */
export async function safeFetch(raw: string, init: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string } = {}, timeoutMs = 10_000): Promise<SafeResponse> {
  const url = await assertPublicHttpsUrl(raw)
  const res = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) })
  const text = (await res.text()).slice(0, 65_536)
  return { status: res.status, ok: res.ok, text }
}
