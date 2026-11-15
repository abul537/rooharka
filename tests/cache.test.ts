import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createStoreCache, keyOf } from '@/lib/cache'
import { keepsCache } from '@/lib/audit-rules'

/** A tiny stand-in for Upstash Redis over HTTPS: understands MGET, SET … EX and INCR. */
function fakeRedis() {
  const data = new Map<string, string>()
  const calls: string[][] = []
  let broken = false
  const f = (async (_url: string, init: RequestInit) => {
    const cmd = JSON.parse(String(init.body)) as string[]
    calls.push(cmd)
    assert.equal((init.headers as Record<string, string>).Authorization, `Bearer ${'k'.repeat(40)}`)
    if (broken) throw new Error('timeout')
    const [op, ...a] = cmd
    const result = op === 'MGET' ? a.map((k) => data.get(k) ?? null) : op === 'SET' ? (data.set(a[0], a[1]), 'OK') : op === 'INCR' ? (data.set(a[0], String(Number(data.get(a[0]) ?? 0) + 1)), Number(data.get(a[0]))) : null
    return new Response(JSON.stringify({ result }))
  }) as unknown as typeof fetch
  return { f, data, calls, break: (b: boolean) => { broken = b } }
}
const ENV = { UPSTASH_REDIS_REST_URL: 'https://x.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'k'.repeat(40) }
const tick = () => new Promise((r) => setTimeout(r, 0))

test('every cache key starts with the store, so one shop can never read another’s entry', async () => {
  assert.equal(keyOf('storeA', 'product', 'honey'), 't:storeA:product:honey')
  const c = createStoreCache({ env: {} })
  const get = c.cached('product', 60, async (storeId, slug) => ({ storeId, slug, price: storeId === 'A' ? 100 : 999 }))
  assert.deepEqual(await get('A', 'honey'), { storeId: 'A', slug: 'honey', price: 100 })
  assert.deepEqual(await get('B', 'honey'), { storeId: 'B', slug: 'honey', price: 999 }, 'same slug, other shop: its own data')
  assert.equal(c.stats.loads, 2)
  // The key is built in one place only.
  const src = readFileSync('lib/cache.ts', 'utf8')
  assert.equal([...src.matchAll(/`t:\$\{storeId\}:/g)].length, 3, 'key, version key and the invalidation prefix')
})

test('memory layer: remembered for its time, one database trip for visitors arriving together, failures not remembered', async () => {
  let t = 1_000_000, loads = 0, fail = false
  const c = createStoreCache({ env: {}, now: () => t })
  const get = c.cached('catalog', 60, async () => { loads++; await tick(); if (fail) throw new Error('db down'); return { n: loads } })
  const [a, b, d] = await Promise.all([get('A'), get('A'), get('A')])
  assert.equal(loads, 1); assert.equal(a, b); assert.equal(b, d)
  t += 59_000; assert.deepEqual(await get('A'), { n: 1 })
  t += 2_000; assert.deepEqual(await get('A'), { n: 2 }, 'older than a minute: loaded again')
  fail = true; t += 61_000
  await assert.rejects(get('A'), /db down/)
  fail = false; assert.deepEqual(await get('A'), { n: 4 }, 'the failure was not remembered')
  assert.equal(c.hasRedis, false)
})

test('a change in one shop clears that shop only', async () => {
  let n = 0
  const c = createStoreCache({ env: {} })
  const get = c.cached('product', 300, async (s, slug) => `${s}/${slug}/${++n}`)
  await get('A', 'x'); await get('A', 'y'); await get('AB', 'x'); await get('B', 'x')
  await c.invalidateStore('A')
  assert.equal(await get('A', 'x'), 'A/x/5'); assert.equal(await get('A', 'y'), 'A/y/6')
  assert.equal(await get('B', 'x'), 'B/x/4', 'another shop keeps its entries')
  assert.equal(await get('AB', 'x'), 'AB/x/3', 'a shop whose id merely starts the same is untouched')
})

test('Redis layer: shared between servers, and a change raises the shop’s version so old entries are ignored', async () => {
  const r = fakeRedis()
  let t = 5_000_000, price = 100
  const server1 = createStoreCache({ env: ENV, fetch: r.f, now: () => t }), server2 = createStoreCache({ env: ENV, fetch: r.f, now: () => t })
  let loads = 0
  const load = async () => { loads++; return { price } }
  const get1 = server1.cached('product', 300, load), get2 = server2.cached('product', 300, load)
  assert.deepEqual(await get1('A', 'honey'), { price: 100 }); await tick()
  assert.deepEqual(JSON.parse(r.data.get('t:A:product:honey')!), { v: '0', d: { price: 100 } })
  assert.deepEqual(r.calls[0], ['MGET', 't:A:ver', 't:A:product:honey'], 'one round trip for version and entry')
  assert.deepEqual(r.calls[1].slice(0, 2).concat(r.calls[1].slice(3)), ['SET', 't:A:product:honey', 'EX', 300] as unknown as string[])
  assert.deepEqual(await get2('A', 'honey'), { price: 100 }); assert.equal(loads, 1, 'the second server used the shared copy'); assert.equal(server2.stats.redisHits, 1)
  // The owner changes the price on server 1.
  price = 250; await server1.invalidateStore('A')
  assert.equal(r.data.get('t:A:ver'), '1')
  assert.deepEqual(await get1('A', 'honey'), { price: 250 }, 'the server that made the change is fresh at once')
  assert.deepEqual(await get2('A', 'honey'), { price: 100 }, 'another server may serve its own copy for up to 10 seconds…')
  t += 10_001
  assert.deepEqual(await get2('A', 'honey'), { price: 250 }, '…then sees the new version')
  assert.equal(loads, 2)
})

test('Redis can only help, never hurt: when it fails the database is used and Redis is left alone for 30 seconds', async () => {
  const r = fakeRedis(); r.break(true)
  let t = 9_000_000, loads = 0
  const c = createStoreCache({ env: ENV, fetch: r.f, now: () => t })
  const get = c.cached('catalog', 60, async () => ++loads)
  const warn = console.warn; console.warn = () => {}
  try {
    assert.equal(await get('A'), 1); assert.equal(c.stats.redisErrors, 1)
    const before = r.calls.length
    assert.equal(await get('B'), 2); await c.invalidateStore('B'); assert.equal(r.calls.length, before, 'no Redis calls while paused')
    r.break(false); t += 30_001
    assert.equal(await get('C'), 3); await tick(); assert.ok(r.data.has('t:C:catalog:'), 'Redis is used again after the pause')
    // Nonsense in Redis is ignored, not served.
    r.data.set('t:D:catalog:', '{not json'); assert.equal(await get('D'), 4)
    r.data.set('t:E:catalog:', JSON.stringify({ v: '7', d: 'stale' })); assert.equal(await get('E'), 5, 'an entry of an older version is not served')
  } finally { console.warn = warn }
  // Without (or with malformed) settings Redis is simply off.
  for (const env of [{}, { UPSTASH_REDIS_REST_URL: 'http://insecure', UPSTASH_REDIS_REST_TOKEN: 'k'.repeat(40) }, { UPSTASH_REDIS_REST_URL: 'https://x.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'short' }]) assert.equal(createStoreCache({ env }).hasRedis, false)
})

test('the cache is cleared by every dashboard change and every order, and never holds a preview', () => {
  const audit = readFileSync('lib/audit.ts', 'utf8')
  assert.match(audit, /if \(entry\.storeId && !keepsCache\(entry\.action\)\) await invalidateStore\(entry\.storeId\)/)
  assert.ok(audit.indexOf('invalidateStore(entry.storeId)') < audit.indexOf('db.auditLog.create'), 'cleared even if the log line cannot be written')
  for (const a of ['product.update', 'collection.create', 'settings.payments', 'theme.publish', 'order.status', 'order.cancel', 'review.approve', 'pos.sale']) assert.equal(keepsCache(a), false, a)
  for (const a of ['auth.login', 'login.failed', 'order.verification', 'order.verification.approve', 'order.note']) assert.equal(keepsCache(a), true, a)
  assert.match(readFileSync('app/api/orders/route.ts', 'utf8'), /after\(async \(\) => \{ await invalidateStore\(store\.id\);/)
  // Previews bypass the cache entirely.
  const product = readFileSync('lib/data/product.ts', 'utf8')
  assert.match(product, /if \(await isPreviewFor\(store\.id\)\) return loadProductPage\(store, slug, true\)/)
  assert.match(product, /storeCached\('product', 300, \(storeId, slug\)[^\n]*\n\s*loadProductPage\(\{ id: storeId[^)]*\}, slug, false\)/)
  const catalog = readFileSync('lib/data/catalog.ts', 'utf8')
  assert.match(catalog, /storeCached\('catalog', 60, \(storeId\) => buildCatalog\(storeId, false\)\)/)
  assert.match(catalog, /const loadPreviewCatalog = cache\(\(storeId: string\) => buildCatalog\(storeId, true\)\)/)
  const col = readFileSync('lib/admin/collections.ts', 'utf8')
  assert.match(col, /return preview \? findCollection\(storeId, handle, true\) : cachedCollection\(storeId, handle\)/)
  // Private data never goes in: the cost price is not in any cached loader.
  assert.doesNotMatch(product + catalog, /costPrice/)
})
