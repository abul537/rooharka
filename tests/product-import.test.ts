import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseCsv, planImport, describePlan, IMPORT_MAX_ROWS, type ExistingVariant } from '@/lib/admin/product-import'

const have = new Map<string, ExistingVariant>([
  ['OUD-50', { id: 'v1', productId: 'p1', sku: 'OUD-50', price: 2500, stock: 10, measured: false, label: '50ml', productName: 'Oud' }],
  ['RICE-KG', { id: 'v2', productId: 'p2', sku: 'RICE-KG', price: 300, stock: 50000, measured: true, label: 'Default', productName: 'Rice' }],
])

test('CSV reading: quotes, commas and line breaks inside quotes, doubled quotes, Excel BOM, blank lines', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\n\n"two\nlines",z\n'), [['a', 'b'], ['x, y', 'he said "hi"'], ['two\nlines', 'z']])
  assert.deepEqual(parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']])
})

test('a known SKU is updated: only what really changed, stock as a difference', () => {
  const p = planImport('SKU,Price,Stock,Crossed-out price\noud-50,"2,700",7,\n', have)
  assert.deepEqual(p.problems, [])
  assert.deepEqual(p.updates, [{ id: 'v1', productId: 'p1', sku: 'OUD-50', label: 'Oud (50ml)', data: { price: 2700 }, stockDelta: -3 }])
  assert.equal(p.creates.length, 0)
})

test('empty cells leave things as they are; an identical row counts as up to date', () => {
  const p = planImport('SKU,Price,Stock,Cost,On sale\nOUD-50,2500,10,,\n', have)
  assert.equal(p.updates.length, 0); assert.equal(p.unchanged, 1)
  assert.match(describePlan(p), /already up to date/)
})

test('bad rows are left out with a reason, good rows still go ahead', () => {
  const p = planImport(['Product,SKU,Price,Crossed-out price,Stock', 'Oud,OUD-50,abc,,', 'Oud,OUD-50,2600,,', 'X,BAD SKU!,100,,', 'Y,Y-1,100,90,', 'Z,Z-1,0,,', 'W,W-1,100,,1.5', ',NEW-9,100,,', 'Fresh,,,,'].join('\n'), have)
  assert.equal(p.problems.length, 8)
  assert.match(p.problems[0], /^Row 2: the price is not a number/)
  assert.match(p.problems[1], /appears twice/)
  assert.match(p.problems.join('|'), /only have letters/); assert.match(p.problems.join('|'), /higher than the price/)
  assert.match(p.problems.join('|'), /more than zero/); assert.match(p.problems.join('|'), /whole number/)
  assert.match(p.problems.join('|'), /no product name/)
  assert.equal(p.updates.length, 0)
})

test('a crossed-out price is checked against the current price when the price cell is empty', () => {
  assert.match(planImport('SKU,Crossed-out price\nOUD-50,2000\n', have).problems[0], /higher than the price/)
  assert.deepEqual(planImport('SKU,Crossed-out price\nOUD-50,3000\n', have).updates[0].data, { compareAtPrice: 3000 })
})

test('products sold by weight keep their stock; other columns still apply', () => {
  const p = planImport('SKU,Price,Stock\nRICE-KG,320,10\n', have)
  assert.equal(p.updates[0].stockDelta, 0); assert.deepEqual(p.updates[0].data, { price: 320 })
  assert.match(p.problems[0], /sold by weight or length/)
})

test('new rows become draft products; same name = variants of one product', () => {
  const p = planImport(['Product,Category,Vendor,Tags,Variant,SKU,Price,Stock,On sale', 'Rose Attar,Attars,Al Noor,"gift, summer",6ml,RA-6,900,5,yes', 'rose attar,,,,12ml,RA-12,1600,,no', 'Musk,,,,,,500,3,'].join('\n'), have)
  assert.deepEqual(p.problems, [])
  assert.equal(p.creates.length, 2)
  const [rose, musk] = p.creates
  assert.equal(rose.slug, 'rose-attar'); assert.equal(rose.category, 'Attars'); assert.deepEqual(rose.tags, ['gift', 'summer'])
  assert.deepEqual(rose.variants.map((v) => [v.label, v.sku, v.price, v.stock, v.isActive]), [['6ml', 'RA-6', 900, 5, true], ['12ml', 'RA-12', 1600, 0, false]])
  assert.deepEqual(musk.variants.map((v) => [v.label, v.sku]), [['Default', null]])
  assert.match(describePlan(p), /2 new products will be added as drafts/)
})

test('spreadsheet formulas and control characters never get stored', () => {
  const p = planImport('Product,Variant,Price\n"=HYPERLINK(""http://x"")",+cmd,100\n', have)
  assert.equal(p.creates[0].name.startsWith('='), false); assert.equal(p.creates[0].variants[0].label, 'cmd')
})

test('limits and unreadable files are refused in plain words', () => {
  assert.match(planImport('x'.repeat(1_000_001), have).problems[0], /larger than 1 MB/)
  assert.match(planImport('SKU,Price\n', have).problems[0], /no rows/)
  assert.match(planImport('Foo,Bar\n1,2\n', have).problems[0], /first row must name the columns/)
  assert.match(planImport('SKU,Price\n' + Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => `S${i},10`).join('\n'), have).problems[0], /at most 2000/)
})

test('code review: the import is guarded, store-scoped, transactional, logged and audited', () => {
  const act = readFileSync('app/admin/(panel)/products/import/actions.ts', 'utf8'), run = readFileSync('lib/admin/product-import-run.ts', 'utf8')
  assert.match(act, /adminOrError\('products\.edit'\)/); assert.match(act, /storeLimit\(/); assert.match(act, /audit\(/)
  assert.match(run, /db\.\$transaction/); assert.match(run, /status: 'DRAFT'/); assert.match(run, /reason: 'IMPORT'/)
  for (const m of run.matchAll(/productVariant\.(updateMany|findMany)\(\{ where: \{([^}]*\}?)/g)) assert.match(m[2], /storeId/, m[0])
  assert.doesNotMatch(run, /\.delete(Many)?\(/)
  assert.match(readFileSync('app/admin/(panel)/products/import/page.tsx', 'utf8'), /requireAdmin\('products\.edit'\)/)
})
