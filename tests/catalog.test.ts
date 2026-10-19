import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyCatalog, discountPercent, pageWindow, parseCatalogParams, shopHref, type CatalogItem } from '@/lib/catalog'

const item = (o: Partial<CatalogItem> & { name: string }): CatalogItem => ({
  id: o.name, slug: o.name.toLowerCase(), subtitle: null, categorySlug: null, isFeatured: false, createdAt: 0, imageUrl: null, imageAlt: null,
  minPrice: 100, maxPrice: 100, compareAt: null, soldOut: false, rating: null, ratingCount: 0, haystack: o.name.toLowerCase(), ...o,
})
const items = [
  item({ name: 'Rose Water', minPrice: 500, createdAt: 3, categorySlug: 'skin', haystack: 'rose water for skin' }),
  item({ name: 'Argan Oil', minPrice: 1500, createdAt: 1, isFeatured: true, categorySlug: 'hair', haystack: 'argan oil for hair' }),
  item({ name: 'Black Seed Oil', minPrice: 900, createdAt: 2, categorySlug: 'hair', haystack: 'black seed oil for hair and skin' }),
]
const P = (o = {}) => parseCatalogParams(o)

test('params are cleaned and defaulted', () => {
  assert.deepEqual(P(), { q: '', category: null, sort: 'featured', page: 1 })
  assert.deepEqual(P({ q: '  rose   water ', category: 'Hair', sort: 'price-asc', page: '2' }), { q: 'rose water', category: 'hair', sort: 'price-asc', page: 2 })
  assert.equal(P({ sort: 'DROP TABLE' }).sort, 'featured')
  assert.equal(P({ page: '-4' }).page, 1); assert.equal(P({ page: 'abc' }).page, 1); assert.equal(P({ category: '../etc' }).category, null)
  assert.equal(P({ q: 'x'.repeat(500) }).q.length, 60); assert.equal(P({ q: ['a', 'b'] }).q, 'a')
})
test('sorting: featured first, newest, price, name', () => {
  assert.deepEqual(applyCatalog(items, P()).items.map((i) => i.name), ['Argan Oil', 'Rose Water', 'Black Seed Oil'])
  assert.deepEqual(applyCatalog(items, P({ sort: 'newest' })).items.map((i) => i.name), ['Rose Water', 'Black Seed Oil', 'Argan Oil'])
  assert.deepEqual(applyCatalog(items, P({ sort: 'price-asc' })).items.map((i) => i.name), ['Rose Water', 'Black Seed Oil', 'Argan Oil'])
  assert.deepEqual(applyCatalog(items, P({ sort: 'price-desc' })).items.map((i) => i.name), ['Argan Oil', 'Black Seed Oil', 'Rose Water'])
  assert.deepEqual(applyCatalog(items, P({ sort: 'name' })).items.map((i) => i.name), ['Argan Oil', 'Black Seed Oil', 'Rose Water'])
})
test('search needs every word; category filters', () => {
  assert.deepEqual(applyCatalog(items, P({ q: 'oil hair' })).items.map((i) => i.name).sort(), ['Argan Oil', 'Black Seed Oil'])
  assert.deepEqual(applyCatalog(items, P({ q: 'OIL skin' })).items.map((i) => i.name), ['Black Seed Oil'])
  assert.equal(applyCatalog(items, P({ q: 'zzz' })).total, 0)
  assert.deepEqual(applyCatalog(items, P({ category: 'skin' })).items.map((i) => i.name), ['Rose Water'])
  assert.equal(applyCatalog(items, P({ category: 'nope' })).total, 0)
})
test('pagination clamps the page', () => {
  const many = Array.from({ length: 30 }, (_, i) => item({ name: `P${i}`, createdAt: i }))
  const r = applyCatalog(many, P({ page: '99' }), 12)
  assert.equal(r.pages, 3); assert.equal(r.page, 3); assert.equal(r.items.length, 6)
  assert.equal(applyCatalog([], P()).pages, 1)
})
test('discount percent', () => {
  assert.equal(discountPercent({ minPrice: 800, compareAt: 1000 }), 20)
  assert.equal(discountPercent({ minPrice: 1000, compareAt: 1000 }), null); assert.equal(discountPercent({ minPrice: 1000, compareAt: null }), null)
})
test('shop links keep choices and drop defaults', () => {
  assert.equal(shopHref(P()), '/shop')
  assert.equal(shopHref(P({ q: 'oil', sort: 'name' }), { page: 2 }), '/shop?q=oil&sort=name&page=2')
  assert.equal(shopHref(P({ category: 'hair', page: '3' }), { category: null, page: 1 }), '/shop')
})
test('page window', () => {
  assert.deepEqual(pageWindow(1, 1), [1]); assert.deepEqual(pageWindow(1, 3), [1, 2, 3])
  assert.deepEqual(pageWindow(10, 20), [1, '…', 9, 10, 11, '…', 20]); assert.deepEqual(pageWindow(2, 20), [1, 2, 3, '…', 20])
})
