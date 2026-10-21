import { NextResponse } from 'next/server'
import { openOtpRequest } from '@/lib/otp/route-helpers'
import { sendOtp } from '@/lib/otp/service'

export const dynamic = 'force-dynamic'

// POST /api/otp/send  { phone }  ->  { length, expiresInSeconds }
export async function POST(request: Request) {
  try {
    const req = await openOtpRequest(request, 'otp-send', 10)
    if ('response' in req) return req.response
    const r = await sendOtp(req.store, req.body.phone, req.ip)
    if (!r.ok) {
      return NextResponse.json({ error: r.error, retryAfterSeconds: r.retryAfterSeconds }, { status: r.status, headers: r.retryAfterSeconds ? { 'Retry-After': String(r.retryAfterSeconds) } : undefined })
    }
    return NextResponse.json({ length: r.length, expiresInSeconds: r.expiresInSeconds })
  } catch (error) {
    console.error('POST /api/otp/send failed:', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
