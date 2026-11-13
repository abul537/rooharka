import { NextResponse } from 'next/server'
import { cronRefusal } from '@/lib/cron-route'
import { runJob } from '@/lib/jobs'
import { syncAllCouriers } from '@/lib/couriers/sync'
import { retryUnbookedOrders } from '@/lib/couriers/booking'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Called by the scheduler (see vercel.json). Asks couriers about parcels on their way; read-only towards the couriers. */
async function handle(req: Request) {
  const refused = cronRefusal(req); if (refused) return refused
  const r = await runJob('courier-sync', 'cron', async () => ({ ...(await syncAllCouriers()), retried: await retryUnbookedOrders() }))
  const headers = { 'Cache-Control': 'no-store' }
  if (r.status === 'busy') return NextResponse.json({ skipped: 'A courier update is already running.' }, { status: 202, headers })
  if (r.status === 'failed') return NextResponse.json({ error: r.error }, { status: 500, headers })
  return NextResponse.json({ ok: true, ...r.result }, { headers })
}
export { handle as GET, handle as POST }
