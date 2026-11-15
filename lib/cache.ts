/**
 * THE STORE CACHE: remembers what every visitor of a shop sees alike (its catalogue, a product page, a
 * collection) so most page views never touch the database.
 *
 * Two layers:
 *   1. THIS SERVER'S MEMORY: always on, costs nothing, shared by the visitors this server instance handles.
 *   2. REDIS (Upstash), optional: one shared memory for ALL server instances. Switched on by setting
 *      UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN; spoken to over plain HTTPS, no package needed.
 *
 * Rules that keep it safe:
 *   - EVERY key starts with the store's id ("t:<storeId>:…"), built in ONE place (`keyOf`), so one shop can never
 *     be served another shop's prices.
 *   - A change in the dashboard calls `invalidateStore`: that shop's entries are forgotten at once here, and in
 *     Redis by raising the shop's version number (older entries are then ignored).
 *   - The cache can only make a page faster, never break it: if Redis is slow, down or returns nonsense, the
 *     data is loaded from the database as if there were no cache, and Redis is left alone for half a minute.
 *   - Only PUBLIC data goes in. Previews (drafts) and anything personal are loaded fresh and never stored.
 *   - A failed load is never remembered, and visitors arriving together share one database trip.
 */
type Fetch = typeof fetch
interface Entry { until: number; value: Promise<unknown> }

const MAX_ENTRIES = 5000
const REDIS_TIMEOUT_MS = 400
const REDIS_PAUSE_MS = 30_000
/** With Redis, each server re-checks the shared copy this often, so a change elsewhere shows within seconds. */
const MEMORY_SECONDS_WITH_REDIS = 10

export const keyOf = (storeId: string, name: string, arg = '') => `t:${storeId}:${name}:${arg}`
const versionKey = (storeId: string) => `t:${storeId}:ver`

export interface CacheOptions { fetch?: Fetch; now?: () => number; env?: Record<string, string | undefined> }

/** Builds a cache. The app uses the one at the bottom of this file; tests build their own with a fake clock and Redis. */
export function createStoreCache(opts: CacheOptions = {}) {
  const now = opts.now ?? Date.now
  const env = opts.env ?? process.env
  const url = (env.UPSTASH_REDIS_REST_URL ?? '').replace(/\/+$/, ''), token = env.UPSTASH_REDIS_REST_TOKEN ?? ''
  const hasRedis = /^https:\/\/[a-z0-9.-]+$/i.test(url) && token.length >= 20
  const memory = new Map<string, Entry>()
  const stats = { memoryHits: 0, redisHits: 0, loads: 0, redisErrors: 0 }
  let pausedUntil = 0

  /** One Redis command over HTTPS. Returns undefined when Redis is not to be used or did not answer properly. */
  async function redis(command: (string | number)[]): Promise<unknown> {
    if (!hasRedis || now() < pausedUntil) return undefined
    try {
      const r = await (opts.fetch ?? fetch)(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(REDIS_TIMEOUT_MS), cache: 'no-store' })
      if (!r.ok) throw new Error(`status ${r.status}`)
      const body = (await r.json()) as { result?: unknown; error?: unknown }
      if (body.error) throw new Error('refused')
      return body.result ?? null
    } catch (e) {
      stats.redisErrors++; pausedUntil = now() + REDIS_PAUSE_MS
      console.warn('[cache] Redis did not answer; using the database for 30 seconds:', e instanceof Error ? e.message : 'error')
      return undefined
    }
  }

  function sweep() {
    if (memory.size < MAX_ENTRIES) return
    const t = now()
    for (const [k, e] of memory) if (e.until <= t) memory.delete(k)
    if (memory.size >= MAX_ENTRIES) memory.clear()
  }

  /**
   * Wraps a loader: `name` says what it is ("product"), `seconds` how long an entry may be served.
   * The returned function takes the store and one optional argument (a slug, a handle).
   */
  function cached<T>(name: string, seconds: number, load: (storeId: string, arg: string) => Promise<T>) {
    return (storeId: string, arg = ''): Promise<T> => {
      const key = keyOf(storeId, name, arg), t = now()
      const hit = memory.get(key)
      if (hit && hit.until > t) { stats.memoryHits++; return hit.value as Promise<T> }

      const value = (async (): Promise<T> => {
        // One round trip: the shop's current version and the stored entry together.
        const got = await redis(['MGET', versionKey(storeId), key])
        const version = Array.isArray(got) && typeof got[0] === 'string' ? got[0] : '0'
        if (Array.isArray(got) && typeof got[1] === 'string') {
          try {
            const stored = JSON.parse(got[1]) as { v?: unknown; d?: T }
            if (stored && stored.v === version && 'd' in stored) { stats.redisHits++; return stored.d as T }
          } catch { /* unreadable entry: load it again */ }
        }
        stats.loads++
        const fresh = await load(storeId, arg)
        // Stored without waiting: the visitor gets the page now. `undefined` (nothing to store) is skipped.
        if (got !== undefined && fresh !== undefined) void redis(['SET', key, JSON.stringify({ v: version, d: fresh }), 'EX', seconds])
        return fresh
      })()
      const mine: Entry = { until: t + Math.min(seconds, hasRedis ? MEMORY_SECONDS_WITH_REDIS : seconds) * 1000, value }
      sweep(); memory.set(key, mine)
      value.catch(() => { if (memory.get(key) === mine) memory.delete(key) })
      return value
    }
  }

  /** Forget everything remembered for ONE store (after its owner changed something). Never throws. */
  async function invalidateStore(storeId: string): Promise<void> {
    const prefix = `t:${storeId}:`
    for (const k of memory.keys()) if (k.startsWith(prefix)) memory.delete(k)
    await redis(['INCR', versionKey(storeId)])
  }

  return { cached, invalidateStore, stats, hasRedis, size: () => memory.size }
}

const shared = createStoreCache()
export const storeCached = shared.cached
export const invalidateStore = shared.invalidateStore
export const cacheStats = () => ({ ...shared.stats, entries: shared.size(), redis: shared.hasRedis })
