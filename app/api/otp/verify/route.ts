import { NextResponse } from 'next/server'
import { openOtpRequest } from '@/lib/otp/route-helpers'
import { otpCookieName, otpCookieOptions, verifyOtp } from '@/lib/otp/service'

export const dynamic = 'force-dynamic'

// POST /api/otp/verify  { phone, code }  ->  sets a signed "phone verified" cookie
export async function POST(request: Request) {
  try {
    const req = await openOtpRequest(request, 'otp-verify', 30)
    if ('response' in req) return req.response
    const r = await verifyOtp(req.store, req.body.phone, req.body.code)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    const res = NextResponse.json({ ok: true, phone: r.phone })
    res.cookies.set(otpCookieName(), r.token, otpCookieOptions())
    return res
  } catch (error) {
    console.error('POST /api/otp/verify failed:', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
