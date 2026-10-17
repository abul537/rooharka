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
