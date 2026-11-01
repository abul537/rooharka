import { NextResponse } from 'next/server'
import { cronRefusal } from '@/lib/cron-route'
import { runJob } from '@/lib/jobs'
import { runBilling } from '@/lib/csmi/manage'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Called once a day by the scheduler (see vercel.json). Same work as the "Run billing" button; safe to repeat. */
async function handle(req: Request) {
  const refused = cronRefusal(req); if (refused) return refused
  const r = await runJob('billing', 'cron', () => runBilling())
  const headers = { 'Cache-Control': 'no-store' }
  if (r.status === 'busy') return NextResponse.json({ skipped: 'Billing is already running.' }, { status: 202, headers })
  if (r.status === 'failed') return NextResponse.json({ error: r.error }, { status: 500, headers })
  return NextResponse.json({ ok: true, ...r.result }, { headers })
}
export { handle as GET, handle as POST }
