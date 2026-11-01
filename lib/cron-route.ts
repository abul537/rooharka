import { NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/cron-auth'

/** First lines of every cron endpoint: refuse anything that is not the scheduler holding CRON_SECRET. */
export function cronRefusal(req: Request): NextResponse | null {
  const auth = checkCronAuth(req.headers.get('authorization'), process.env.CRON_SECRET)
  if (auth === 'ok') return null
  if (auth === 'unconfigured') return NextResponse.json({ error: 'CRON_SECRET is not set (needs 24+ characters), so scheduled jobs are switched off.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  return NextResponse.json({ error: 'Not allowed.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
}
