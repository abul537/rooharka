/**
 * Tiny in-memory rate limiter (fixed window) to slow down order spam and
 * tracking-code guessing.
 *
 * Limitation: the counters live in one server process. On serverless hosting
 * (e.g. Vercel) each instance has its own, so treat this as a speed bump, not a
 * wall. Swap for Redis / Upstash when traffic grows.
 */
const buckets = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
  }
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSeconds: 0 }
  }
  bucket.count += 1
  return { ok: bucket.count <= limit, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) }
}

export function clientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'unknown'
}

/**
 * A limit PER SHOP, on top of the per-visitor ones. It is there for the other shops: if one shop's traffic (or a
 * script pointed at it) goes wild, it runs into its own ceiling instead of using up the server and the database
 * that every shop shares. The ceilings are far above anything a real shop does in a minute.
 */
export const STORE_LIMITS = { orders: 300, visits: 3000, speed: 600, newsletter: 60, export: 6, import: 20 } as const
export const storeLimit = (storeId: string, what: keyof typeof STORE_LIMITS) => rateLimit(`store:${what}:${storeId}`, STORE_LIMITS[what], 60_000)
