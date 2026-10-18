import assert from 'node:assert/strict'
import { test } from 'node:test'
import { groupBy, memoAsync } from '@/lib/memo'

test('memoAsync: one load for concurrent callers, reused until the TTL ends', async () => {
  let loads = 0, clock = 0
  const m = memoAsync(1000, async () => ++loads, () => clock)
  const [a, b] = await Promise.all([m.get(), m.get()])
  assert.equal(a, 1); assert.equal(b, 1); assert.equal(loads, 1)
  clock = 999; assert.equal(await m.get(), 1)
  clock = 1001; assert.equal(await m.get(), 2)
})
test('memoAsync: a failure is not remembered', async () => {
  let n = 0
  const m = memoAsync(60_000, async () => { if (++n === 1) throw new Error('db asleep'); return 'ok' })
  await assert.rejects(m.get(), /db asleep/)
  assert.equal(await m.get(), 'ok')
  assert.equal(await m.get(), 'ok'); assert.equal(n, 2)
})
test('groupBy keeps order and groups by key', () => {
  const g = groupBy([{ p: '1', n: 'a' }, { p: '2', n: 'b' }, { p: '1', n: 'c' }], (r) => r.p)
  assert.deepEqual(g.get('1')!.map((r) => r.n), ['a', 'c']); assert.equal(g.get('3'), undefined)
})
