import { db } from '@/lib/db'
import { getCurrentStore } from '@/lib/store'
import { isPreviewFor } from '@/lib/preview/server'
import { getCheckoutConfig, loadCheckoutEntries } from '@/lib/data/checkout'
import { parseLead } from '@/lib/leads'
import { lineTotal } from '@/lib/units/quantity'
import { clientIp, rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
const done = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

/**
 * POST /api/checkout/lead { phone, name, items }: the customer finished the address step. The shop remembers what
 * they were buying (with today's prices, read from the database) so the owner can follow up if no order comes.
 * Always answers "ok" with no content: checkout never depends on it.
 */
export async function POST(request: Request) {
  try {
    if (!rateLimit(`lead:${clientIp(request.headers)}`, 10, 3_600_000).ok || Number(request.headers.get('content-length') ?? 0) > 4000) return done()
    const store = await getCurrentStore()
    if (!store || !rateLimit(`lead-store:${store.id}`, 600, 3_600_000).ok || (await isPreviewFor(store.id))) return done()
    const lead = parseLead(await request.json().catch(() => null))
    if (!lead) return done()
    const config = await getCheckoutConfig(store)
    const { entries } = await loadCheckoutEntries(store.id, config.maxQuantity, lead.items)
    if (entries.length === 0) return done()
    const items = entries.map((e) => ({ variantId: e.line.variantId, quantity: e.quantity, name: e.line.productName, label: e.line.variantLabel, price: e.line.unitPrice }))
    const subtotal = entries.reduce((sum, e) => sum + lineTotal(e.line.unitPrice, e.quantity, e.line.unitCode), 0)
    await db.checkoutLead.upsert({
      where: { storeId_phone: { storeId: store.id, phone: lead.phone } },
      create: { storeId: store.id, phone: lead.phone, name: lead.name, items, subtotal },
      update: { name: lead.name, items, subtotal, recoveredAt: null, contactedAt: null },
    })
  } catch (e) { console.error('[lead]', e instanceof Error ? e.message : e) }
  return done()
}
