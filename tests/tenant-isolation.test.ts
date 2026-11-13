/**
 * A code review that runs with the tests: every query on a store-owned table, in the product, collection and
 * courier code, must name the store. It reads the source files, finds each database call and checks its filter.
 * (It cannot replace a test against a real database, but it fails the moment someone writes a query that could
 * read or change another store's rows.)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const FILES = ['lib/admin/products.ts', 'lib/admin/collections.ts', 'lib/admin/categories.ts', 'lib/couriers/booking.ts', 'lib/couriers/webhook.ts', 'lib/couriers/vault.ts', 'lib/ai/describe.ts', 'app/admin/(panel)/products/export/route.ts']
/** Tables whose rows belong to exactly one store. */
const OWNED = ['product', 'collection', 'category', 'order', 'tenantCourierCredential', 'aiUsage', 'storeSettings']
/** Reads and many-row writes: the filter itself must name the store. */
const MUST_SCOPE = ['findFirst', 'findMany', 'findUnique', 'count', 'groupBy', 'updateMany', 'deleteMany']

/** The text of the call's arguments: from the opening bracket to its matching closing bracket. */
function callArgs(src: string, from: number): string {
  let depth = 0
  for (let i = from; i < src.length; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')' && --depth === 0) return src.slice(from, i + 1)
  }
  return src.slice(from)
}

test('every read and bulk write on a store-owned table is limited to one store', () => {
  let checked = 0
  for (const file of FILES) {
    const src = readFileSync(file, 'utf8')
    const re = new RegExp(`\\b(?:db|tx)\\.(${OWNED.join('|')})\\.(${MUST_SCOPE.join('|')})\\(`, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(src))) {
      const args = callArgs(src, m.index + m[0].length - 1)
      const line = src.slice(0, m.index).split('\n').length
      checked++
      // `mine` and `where` are variables built from the store id a few lines above (bulk actions and the product list).
      assert.match(args, /storeId|\bmine\b|where,|where }/, `${file}:${line} ${m[1]}.${m[2]} has no store filter: ${args.slice(0, 120)}`)
    }
  }
  assert.ok(checked > 30, `expected to review many queries, reviewed ${checked}`)
})

test('the variables used as filters really start from the store', () => {
  const products = readFileSync('lib/admin/products.ts', 'utf8')
  assert.match(products, /const mine = \{ id: \{ in: r\.ids \}, storeId: admin\.storeId \}/)
  assert.match(products, /return \{ storeId, \.\.\.\(and\.length \? \{ AND: and \} : \{\}\) \}/)
})

test('storefront product data never selects the private cost', () => {
  for (const file of ['lib/data/catalog.ts', 'lib/data/checkout.ts', 'lib/data/product.ts', 'components/product/PurchasePanel.tsx']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /costPrice/, `${file} must not touch the cost`)
  }
})
