import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mergeExtra } from '@/lib/admin/extra-merge'

test('one settings group is replaced; every other group is kept', () => {
  const now = { couriers: { enabled: ['postex'] }, fraud: { enabled: false, threshold: 5000 }, wallets: [{ name: 'JazzCash' }] }
  assert.deepEqual(mergeExtra(now, 'fraud', { enabled: true, threshold: 3000 }), { couriers: { enabled: ['postex'] }, fraud: { enabled: true, threshold: 3000 }, wallets: [{ name: 'JazzCash' }] })
  assert.deepEqual(now.fraud, { enabled: false, threshold: 5000 }, 'the stored value read from the database is not changed in place')
})

test('nothing stored yet, or something unexpected stored: starts clean', () => {
  for (const bad of [null, undefined, 'text', 5, ['x']]) assert.deepEqual(mergeExtra(bad, 'pixels', { meta: '1' }), { pixels: { meta: '1' } }, String(bad))
})

test('only plain JSON reaches the database (what is saved is exactly what is read back)', () => {
  const v = { a: 1, gone: undefined, fn: () => 1, when: new Date('2026-11-23T00:00:00Z'), deep: { list: [1, 'two', null] } }
  const out = mergeExtra({}, 'x', v) as Record<string, Record<string, unknown>>
  assert.deepEqual(out.x, { a: 1, when: '2026-11-23T00:00:00.000Z', deep: { list: [1, 'two', null] } })
  const deep = { inner: { n: 1 } }; const merged = mergeExtra({}, 'k', deep) as Record<string, { inner: { n: number } }>
  deep.inner.n = 2; assert.equal(merged.k.inner.n, 1, 'a copy, not a shared object')
})

test('code review: every write to StoreSettings.extra goes through a JSON-typed value', () => {
  assert.match(readFileSync('lib/admin/extra.ts', 'utf8'), /data: \{ extra: mergeExtra\(current\?\.extra, key, value\) \}/)
  assert.match(readFileSync('lib/fraud/store.ts', 'utf8'), /await saveExtra\(storeId, 'fraud', value\)/)
  assert.match(readFileSync('lib/admin/settings.ts', 'utf8'), /const extra = mergeExtra\(current\?\.extra, 'manualPayments', wallets\)/)
  assert.match(readFileSync('lib/couriers/store.ts', 'utf8'), /const extra = mergeExtra\(current\?\.extra, 'couriers', /)
  // Nowhere may a settings object of "anything" be forced into a JSON column again.
  for (const f of ['lib/admin/extra.ts', 'lib/fraud/store.ts', 'lib/admin/settings.ts', 'lib/couriers/store.ts']) assert.doesNotMatch(readFileSync(f, 'utf8'), /as Record<string, unknown>\), /, f)
})

test('toJson: what goes into a JSON column is plain JSON, and a copy', async () => {
  const { toJson } = await import('@/lib/json')
  assert.deepEqual(toJson([{ itemId: 'a', quantity: 2, gone: undefined }]), [{ itemId: 'a', quantity: 2 }])
  assert.equal(toJson(undefined), null); assert.equal(toJson('x'), 'x')
  const src = { checkedAt: new Date('2026-11-23T12:00:00Z'), reasons: ['new phone'] }
  const out = toJson(src) as { checkedAt: string; reasons: string[] }
  assert.equal(out.checkedAt, '2026-11-23T12:00:00.000Z'); src.reasons.push('x'); assert.deepEqual(out.reasons, ['new phone'])
})

test('code review: our own objects reach JSON columns only through toJson (never "as object")', () => {
  for (const f of ['lib/returns-data.ts', 'lib/fraud/verify.ts', 'lib/admin/extra-merge.ts', 'lib/stock-log.ts']) assert.doesNotMatch(readFileSync(f, 'utf8'), /as object\b/, f)
  assert.equal((readFileSync('lib/returns-data.ts', 'utf8').match(/items: toJson\(picked\.lines\)/g) ?? []).length, 2)
  assert.match(readFileSync('lib/fraud/verify.ts', 'utf8'), /verification: toJson\(stored\)/)
  assert.match(readFileSync('lib/stock-log.ts', 'utf8'), /type Tx = Pick<Prisma\.TransactionClient, 'stockMovement'>/)
})
