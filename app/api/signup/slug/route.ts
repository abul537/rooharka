import { NextResponse } from 'next/server'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { slugProblem } from '@/lib/signup/rules'
import { slugAvailable } from '@/lib/signup/service'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }

/** Public yes/no: is this store address usable? Rate limited, and it only ever says yes or no (never who owns an address). */
export async function GET(req: Request) {
  if (!rateLimit(`slug-check:${clientIp(req.headers)}`, 60, 60_000).ok) return NextResponse.json({ available: false, reason: 'Too many checks. Please wait a moment.' }, { status: 429, headers })
  const slug = (new URL(req.url).searchParams.get('slug') ?? '').toLowerCase().slice(0, 40)
  const problem = slugProblem(slug)
  if (problem) return NextResponse.json({ available: false, reason: problem }, { headers })
  try {
    const available = await slugAvailable(slug)
    return NextResponse.json(available ? { available: true } : { available: false, reason: 'That address is already taken.' }, { headers })
  } catch (e) {
    console.error('[slug check]', e)
    return NextResponse.json({ available: false, reason: 'Could not check right now. You can still submit; we will check again.' }, { status: 503, headers })
  }
}
