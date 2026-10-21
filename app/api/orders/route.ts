import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { isPhoneVerified, otpCookieName, otpCookieOptions } from '@/lib/otp/service'
import { getCurrentStore } from '@/lib/store'
import { getCheckoutConfig } from '@/lib/data/checkout'
import { validateOrderRequest } from '@/lib/orders/validate'
import { createOrder, OrderError } from '@/lib/orders/create-order'
import { clientIp, rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// POST /api/orders  ->  { number, trackingCode, ... }
export async function POST(request: Request) {
  const ip = clientIp(request.headers)

  const limit = rateLimit(`orders:${ip}`, 8, 10 * 60 * 1000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a few minutes and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  // Refuse oversized bodies before parsing.
  if (Number(request.headers.get('content-length') ?? 0) > 20_000) {
    return NextResponse.json({ error: 'Request too large.' }, { status: 413 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  try {
    const store = await getCurrentStore()
    if (!store) return NextResponse.json({ error: 'This store is not available.' }, { status: 404 })

    const config = await getCheckoutConfig(store)
    const parsed = validateOrderRequest(body, config.fields)
    if (!parsed.ok) {
      return NextResponse.json({ error: 'Please check the highlighted details.', fields: parsed.errors }, { status: 400 })
    }

    // The OTP gate is enforced HERE, not only on the page: skipping the page and calling this API gets nothing.
    if (config.phoneVerification) {
      const jar = await cookies()
      if (!isPhoneVerified(jar.get(otpCookieName())?.value, store.id, parsed.value.customer.phone)) {
        return NextResponse.json({ error: 'Please verify your mobile number first.', code: 'PHONE_NOT_VERIFIED' }, { status: 403 })
      }
    }

    const order = await createOrder(config, parsed.value, { ip })
    const res = NextResponse.json(order, { status: 201 })
    // One verification covers one order: the next purchase asks again.
    if (config.phoneVerification) res.cookies.set(otpCookieName(), '', { ...otpCookieOptions(), maxAge: 0 })
    return res
  } catch (error) {
    if (error instanceof OrderError) {
      const status = error.code === 'BLOCKED' ? 403 : 409
      return NextResponse.json({ error: error.message, code: error.code, fields: error.details }, { status })
    }
    console.error('POST /api/orders failed:', error)
    return NextResponse.json({ error: 'Something went wrong while placing your order. Please try again.' }, { status: 500 })
  }
}
