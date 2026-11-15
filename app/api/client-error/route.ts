import { getStoreForHost } from '@/lib/store'
import { recordError } from '@/lib/errors/record'
import { isBot } from '@/lib/admin/insights'
import { clientIp, rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
const done = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

/** POST /api/client-error { message, digest, path }: a shop page failed in a visitor's browser. Always answers "ok". */
export async function POST(request: Request) {
  try {
    if (isBot(request.headers.get('user-agent')) || Number(request.headers.get('content-length') ?? 0) > 1500) return done()
    if (!rateLimit(`client-error:${clientIp(request.headers)}`, 5, 60_000).ok) return done()
    const body = (await request.json().catch(() => null)) as { message?: unknown; digest?: unknown; path?: unknown } | null
    if (!body) return done()
    const store = await getStoreForHost().catch(() => null)
    await recordError({ kind: 'client', path: body.path, message: body.message, digest: typeof body.digest === 'string' ? body.digest : null, storeId: store?.id ?? null })
  } catch { /* silent */ }
  return done()
}
