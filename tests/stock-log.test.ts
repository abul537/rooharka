import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { STOCK_REASONS, logStock, signed } from '@/lib/stock-log'

test('stock history: real changes are written with the store, nothing for a change of zero', async () => {
  const written: object[][] = []
  const tx = { stockMovement: { createMany: async (a: { data: object[] }) => { written.push(a.data) } } }
  await logStock(tx, 'store1', [
    { productId: 'p1', variantId: 'v1', delta: -2, reason: 'ORDER', note: 'x'.repeat(500) },
    { productId: 'p1', variantId: 'v2', delta: 0, reason: 'ADJUSTED' },
    { productId: 'p1', variantId: 'v3', delta: 1.5, reason: 'ADJUSTED' },
    { productId: '', variantId: 'v4', delta: 3, reason: 'ADJUSTED' },
    { productId: 'p2', variantId: 'v5', delta: 5, reason: 'ORDER_CANCELLED', orderId: 'o1', userId: 'u1' },
  ])
  assert.equal(written.length, 1)
  assert.deepEqual(written[0], [
    { storeId: 'store1', productId: 'p1', variantId: 'v1', delta: -2, reason: 'ORDER', note: 'x'.repeat(200), orderId: null, userId: null },
    { storeId: 'store1', productId: 'p2', variantId: 'v5', delta: 5, reason: 'ORDER_CANCELLED', note: null, orderId: 'o1', userId: 'u1' },
  ])
  await logStock(tx, 'store1', []); await logStock(tx, 'store1', [{ productId: 'p', variantId: 'v', delta: 0, reason: 'ORDER' }]); assert.equal(written.length, 1, 'no empty writes')
  assert.equal(signed(5), '+5'); assert.equal(signed(-2), '-2'); assert.ok(Object.keys(STOCK_REASONS).length >= 7)
})

test('every place that changes stock writes the history in the same transaction', () => {
  const places: [string, RegExp[]][] = [
    ['lib/orders/create-order.ts', [/await logStock\(tx, storeId, lines\.filter\(\(l\) => l\.v\.trackStock\)[^\n]*delta: -l\.quantity, reason: 'ORDER'/]],
    ['lib/admin/orders.ts', [/await logStock\(tx, admin\.storeId, \[\{[^\n]*delta: item\.quantity, reason: 'ORDER_CANCELLED'/]],
    ['lib/pos/service.ts', [/reason: 'COUNTER_SALE'/, /reason: 'COUNTER_VOID'/]],
    ['lib/admin/products.ts', [/await logStock\(tx, admin\.storeId, \[\{ productId, variantId: v\.id, delta, reason: 'ADJUSTED', userId: admin\.id \}\]\)/]],
  ]
  for (const [file, patterns] of places) { const src = readFileSync(file, 'utf8'); for (const p of patterns) assert.match(src, p, file); assert.doesNotMatch(src, /logStock\(db,/, `${file}: always the transaction, never the plain connection`) }
  // Stock that was not put back (an untracked variant) is not recorded as put back.
  assert.match(readFileSync('lib/admin/orders.ts', 'utf8'), /if \(back\.count > 0 && item\.productId\) await logStock/)
  assert.match(readFileSync('components/admin/StockHistory.tsx', 'utf8'), /where: \{ storeId, productId \}/)
})
