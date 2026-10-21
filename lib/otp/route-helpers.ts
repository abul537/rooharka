import { NextResponse } from 'next/server'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { getCurrentStore } from '@/lib/store'

/** Shared start of both OTP endpoints: per-IP speed limit, size limit, JSON body, current store. */
export async function openOtpRequest(request: Request, bucket: string, limit: number) {
  const ip = clientIp(request.headers)
  const l = rateLimit(`${bucket}:${ip}`, limit, 10 * 60 * 1000)
  if (!l.ok) {
    return { response: NextResponse.json({ error: 'Too many attempts. Please wait a few minutes and try again.' }, { status: 429, headers: { 'Retry-After': String(l.retryAfterSeconds) } }) }
  }
  if (Number(request.headers.get('content-length') ?? 0) > 2_000) return { response: NextResponse.json({ error: 'Request too large.' }, { status: 413 }) }
  let body: Record<string, unknown>
  try {
    const parsed = await request.json()
    body = parsed && typeof parsed === 'object' ? parsed : {}
  } catch { return { response: NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) } }
  const store = await getCurrentStore()
  if (!store) return { response: NextResponse.json({ error: 'This store is not available.' }, { status: 404 }) }
  return { ip, body, store }
}
