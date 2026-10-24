import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canPlatform, isPlatformRole, toCsv } from '@/lib/csmi/rules'
import { loadPlatform } from '@/lib/csmi/data'

export const dynamic = 'force-dynamic'

// GET /csmi/reports/export?days=30  ->  CSV, one row per store. Platform staff only.
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user || user.storeId !== null || !isPlatformRole(user.role) || !canPlatform(user.role, 'csmi.view')) {
    return new NextResponse('Not signed in', { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  const d = Number(new URL(request.url).searchParams.get('days'))
  const days = [7, 30, 90].includes(d) ? d : 30
  const p = await loadPlatform(days)

  const csv = toCsv(
    ['Store', 'Address', 'Status', 'Plan', 'Subscription', 'Owner', 'Owner email', `Orders (${days}d)`, `Sales (${days}d)`, 'Delivered', 'Cancelled', 'Returned', 'Phone codes sent', 'Phone codes verified', 'Monthly revenue', 'Monthly cost', 'Monthly profit', 'Last order', 'Attention'],
    p.rows.map((r) => [
      r.name, r.slug, r.status, r.planName ?? '', r.subStatus ?? '', r.ownerName, r.ownerEmail, r.orders, r.gmv, r.delivered, r.cancelled, r.returned, r.otpSent, r.otpVerified,
      r.bucket === 'MRR' ? r.monthly : 0, r.cost, r.profit.profit, r.lastOrderAt ? r.lastOrderAt.toISOString().slice(0, 10) : '', r.flags.map((f) => f.text).join('; '),
    ]),
  )
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="stores-report-${days}d.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
