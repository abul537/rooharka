import { handleCourierWebhook } from '@/lib/couriers/webhook'

export const dynamic = 'force-dynamic'

/** PostEx tells us where a parcel is. The store id in the path decides whose data may change. */
export async function POST(req: Request, ctx: { params: Promise<{ tenantId: string }> }) {
  return handleCourierWebhook('postex', (await ctx.params).tenantId, req)
}
