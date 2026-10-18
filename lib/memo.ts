/**
 * Remembers the result of an async loader for `ttlMs` (per server process).
 *  - concurrent callers share ONE in-flight load (no stampede on the database)
 *  - a failed load is never remembered: the next call tries again
 * Use only for data that is the same for every visitor and changes rarely.
 */
export function memoAsync<T>(ttlMs: number, load: () => Promise<T>, now: () => number = Date.now): { get(): Promise<T>; clear(): void } {
  let entry: { at: number; value: Promise<T> } | undefined
  return {
    get() {
      if (entry && now() - entry.at < ttlMs) return entry.value
      const value = load()
      const mine = { at: now(), value }
      entry = mine
      value.catch(() => { if (entry === mine) entry = undefined })
      return value
    },
    clear() { entry = undefined },
  }
}

/** Groups rows by key, keeping their order. */
export function groupBy<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>()
  for (const r of rows) {
    const k = key(r)
    const list = m.get(k)
    if (list) list.push(r)
    else m.set(k, [r])
  }
  return m
}

/** `memoAsync` for a loader that takes a key (e.g. a store id). At most `max` keys are kept. */
export function memoKeyed<K extends string, T>(ttlMs: number, load: (key: K) => Promise<T>, max = 500) {
  const cache = new Map<K, ReturnType<typeof memoAsync<T>>>()
  return (key: K): Promise<T> => {
    let m = cache.get(key)
    if (!m) {
      if (cache.size >= max) cache.clear()
      m = memoAsync(ttlMs, () => load(key))
      cache.set(key, m)
    }
    return m.get()
  }
}
