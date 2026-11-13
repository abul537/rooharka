import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BULK_ACTIONS, EXPORT_HEADER, MAX_BULK, MAX_TAGS, cloneName, cloneSku, csvCell, listHref, margin, mergeTags, pageCount, parseBarcode, parseBulk,
  parseCost, parseListQuery, parseSku, parseSlug, parseTags, parseVendor, parseWeightGrams, toCsv,
} from '@/lib/admin/product-extras'
import { parseNewProduct, parseProductEdit } from '@/lib/admin/product-rules'

const G = (o: Record<string, string | string[]>) => ({
  get: (k: string) => (k in o ? (Array.isArray(o[k]) ? (o[k] as string[])[0] : (o[k] as string)) : null),
  getAll: (k: string) => (k in o ? (Array.isArray(o[k]) ? (o[k] as string[]) : [o[k] as string]) : []),
})

test('tags: trimmed, de-duplicated ignoring capitals, limited', () => {
  assert.deepEqual(parseTags(' Summer, gift ,summer,\n  New   arrival ,, '), { ok: true, value: ['Summer', 'gift', 'New arrival'] })
  assert.deepEqual(parseTags(''), { ok: true, value: [] })
  assert.equal(parseTags('x'.repeat(31)).ok, false)
  assert.equal(parseTags('<script>').ok, false)
  assert.equal(parseTags(Array.from({ length: MAX_TAGS + 1 }, (_, i) => `t${i}`).join(',')).ok, false)
  assert.equal(parseTags(Array.from({ length: MAX_TAGS }, (_, i) => `t${i}`).join(',')).ok, true)
})

test('vendor, SKU, barcode, weight, page address, cost', () => {
  assert.deepEqual(parseVendor('  Al  Karam '), { ok: true, value: 'Al Karam' })
  assert.deepEqual(parseVendor(''), { ok: true, value: null })
  assert.equal(parseVendor('x'.repeat(81)).ok, false)
  assert.deepEqual(parseSku(' tee-red_m '), { ok: true, value: 'TEE-RED_M' })
  for (const bad of ['', 'has space', 'x'.repeat(31), 'ab/c']) assert.equal(parseSku(bad).ok, false, bad)
  assert.deepEqual(parseBarcode('8964000123456'), { ok: true, value: '8964000123456' })
  assert.deepEqual(parseBarcode(' '), { ok: true, value: null })
  for (const bad of ['123', '12 34 56', '<b>1234', 'x'.repeat(33)]) assert.equal(parseBarcode(bad).ok, false, bad)
  assert.deepEqual(parseWeightGrams('250'), { ok: true, value: 250 })
  assert.deepEqual(parseWeightGrams(''), { ok: true, value: null })
  for (const bad of ['0', '-5', '1.5', '2000000', 'abc']) assert.equal(parseWeightGrams(bad).ok, false, bad)
  assert.deepEqual(parseSlug('rose-water-2'), { ok: true, value: 'rose-water-2' })
  for (const bad of ['', 'Rose', 'a--b', '-a', 'a b', 'x'.repeat(61)]) assert.equal(parseSlug(bad).ok, false, bad)
  assert.deepEqual(parseCost('1,250.50'), { ok: true, value: 1250.5 })
  assert.deepEqual(parseCost(''), { ok: true, value: null })
  for (const bad of ['-1', '1.234', 'abc']) assert.equal(parseCost(bad).ok, false, bad)
})

test('margin: profit and percent of price; nothing when a number is missing; a loss is negative', () => {
  assert.deepEqual(margin(1000, 600), { profit: 400, marginPct: 40 })
  assert.deepEqual(margin(999, 333), { profit: 666, marginPct: 66.7 })
  assert.deepEqual(margin(500, 650), { profit: -150, marginPct: -30 })
  assert.equal(margin(1000, null), null); assert.equal(margin(null, 5), null); assert.equal(margin(0, 5), null)
  assert.deepEqual(margin(100, 0), { profit: 100, marginPct: 100 })
})

test('duplicate: name and SKUs of the copy', () => {
  assert.equal(cloneName('Rose water'), 'Copy of Rose water')
  assert.ok(cloneName('x'.repeat(120)).length <= 120)
  const taken = new Set(['TEE-M', 'TEE-L'])
  const a = cloneSku('TEE-M', taken); taken.add(a)
  const b = cloneSku('TEE-M', taken); taken.add(b)
  assert.equal(a, 'TEE-M-COPY'); assert.equal(b, 'TEE-M-COPY2')
  const long = cloneSku('X'.repeat(30), taken)
  assert.ok(long.length <= 30 && /^[A-Z0-9_-]+$/.test(long) && !taken.has(long))
})

test('list query: safe defaults, filters read from the address, strange values dropped', () => {
  assert.deepEqual(parseListQuery({}), { q: '', status: null, type: null, categoryId: null, tag: null, stock: null, sort: 'newest', page: 1 })
  const q = parseListQuery({ q: '  tee ', status: 'active', type: 'simple', category: 'cat_1', tag: 'gift', stock: 'low', sort: 'name', page: '3' })
  assert.deepEqual(q, { q: 'tee', status: 'ACTIVE', type: 'SIMPLE', categoryId: 'cat_1', tag: 'gift', stock: 'low', sort: 'name', page: 3 })
  const bad = parseListQuery({ status: 'HACK', category: "x' OR 1=1", stock: 'all', sort: 'price', page: '-2', q: ['a', 'b'] })
  assert.deepEqual(bad, { q: 'a', status: null, type: null, categoryId: null, tag: null, stock: null, sort: 'newest', page: 1 })
  assert.equal(parseListQuery({ category: 'none' }).categoryId, 'none')
  assert.equal(parseListQuery({ q: 'x'.repeat(200) }).q.length, 80)
})

test('list links: keep the other filters, changing a filter returns to page 1, page links keep the page', () => {
  const q = parseListQuery({ q: 'tee', status: 'draft', page: '4', sort: 'name' })
  assert.equal(listHref(q, { status: null }), '/admin/products?q=tee&sort=name')
  assert.equal(listHref(q, { page: 5 }), '/admin/products?q=tee&status=DRAFT&sort=name&page=5')
  assert.equal(listHref(q, { page: 1 }), '/admin/products?q=tee&status=DRAFT&sort=name')
  assert.equal(listHref(parseListQuery({})), '/admin/products')
  assert.equal(pageCount(0), 1); assert.equal(pageCount(25), 1); assert.equal(pageCount(26), 2)
})

test('bulk: needs an action and a selection; limits; category and tags read only when needed', () => {
  assert.equal(parseBulk(G({ ids: ['a1'] })).ok, false)
  assert.equal(parseBulk(G({ bulkAction: 'archive' })).ok, false)
  assert.equal(parseBulk(G({ bulkAction: 'hack', ids: ['a1'] })).ok, false)
  assert.equal(parseBulk(G({ bulkAction: 'archive', ids: ['bad id!'] })).ok, false)
  assert.equal(parseBulk(G({ bulkAction: 'archive', ids: Array.from({ length: MAX_BULK + 1 }, (_, i) => `p${i}`) })).ok, false)
  assert.deepEqual(parseBulk(G({ bulkAction: 'archive', ids: ['p1', 'p1', 'p2'] })), { ok: true, value: { action: 'archive', ids: ['p1', 'p2'], categoryId: null, tags: [] } })
  const c = parseBulk(G({ bulkAction: 'category', ids: ['p1'], bulkCategory: 'cat_9' }))
  assert.ok(c.ok && c.value.categoryId === 'cat_9')
  assert.ok(parseBulk(G({ bulkAction: 'category', ids: ['p1'], bulkCategory: '' })).ok, 'empty = no category')
  assert.equal(parseBulk(G({ bulkAction: 'add-tags', ids: ['p1'], bulkTags: ' ' })).ok, false)
  const t = parseBulk(G({ bulkAction: 'add-tags', ids: ['p1'], bulkTags: 'gift, Eid' }))
  assert.ok(t.ok && t.value.tags.join() === 'gift,Eid')
  assert.equal(new Set(BULK_ACTIONS).size, BULK_ACTIONS.length)
})

test('bulk tags: add without doubles, remove ignoring capitals, never over the limit', () => {
  assert.deepEqual(mergeTags(['Summer', 'gift'], ['GIFT', 'Eid'], 'add'), ['Summer', 'gift', 'Eid'])
  assert.deepEqual(mergeTags(['Summer', 'gift'], ['summer'], 'remove'), ['gift'])
  assert.equal(mergeTags(Array.from({ length: MAX_TAGS }, (_, i) => `t${i}`), ['new'], 'add').length, MAX_TAGS)
})

test('CSV: quoting, and cells that could run as a formula are defused', () => {
  assert.equal(csvCell('plain'), 'plain')
  assert.equal(csvCell('a,b'), '"a,b"')
  assert.equal(csvCell('say "hi"'), '"say ""hi"""')
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"')
  assert.equal(csvCell('=HYPERLINK("http://evil")'), `"'=HYPERLINK(""http://evil"")"`)
  for (const s of ['+1', '-1', '@x']) assert.equal(csvCell(s), `'${s}`)
  assert.equal(csvCell(-5), '-5', 'a real negative number is left alone')
  assert.equal(csvCell(null), ''); assert.equal(csvCell(true), 'yes'); assert.equal(csvCell(1250.5), '1250.5')
  const csv = toCsv(['A', 'B'], [['x', 1], ['y, z', null]])
  assert.equal(csv, '﻿A,B\r\nx,1\r\n"y, z",\r\n')
  assert.equal(EXPORT_HEADER.length, 18)
})

// ------------------------------------------------------------------ the forms
const base = { name: 'Tee', status: 'DRAFT', type: 'SIMPLE', unitCode: 'piece', v_price: '1500', v_stock: '5' }

test('add product: organisation, cost, barcode, weight and track-stock are read; old small forms still work', () => {
  const r = parseNewProduct(G({ ...base, vendor: ' Khaadi ', tags: 'summer, Summer, gift', v_cost: '900', v_sku: 'tee-1', v_barcode: '8964000123456', v_weight: '250', v_trackSent: '1' }))
  assert.ok(r.ok)
  if (r.ok) {
    assert.equal(r.value.product.vendor, 'Khaadi'); assert.deepEqual(r.value.product.tags, ['summer', 'gift'])
    assert.deepEqual([r.value.variant.costPrice, r.value.variant.sku, r.value.variant.barcode, r.value.variant.weightGrams, r.value.variant.trackStock], [900, 'TEE-1', '8964000123456', 250, false])
  }
  const tracked = parseNewProduct(G({ ...base, v_trackSent: '1', v_track: 'on' }))
  assert.ok(tracked.ok && tracked.value.variant.trackStock === true)
  const old = parseNewProduct(G(base))
  assert.ok(old.ok && old.value.product.vendor === undefined && old.value.product.tags === undefined && old.value.variant.trackStock === undefined)
  assert.equal(parseNewProduct(G({ ...base, v_barcode: '12' })).ok, false)
  assert.equal(parseNewProduct(G({ ...base, v_cost: 'abc' })).ok, false)
  assert.equal(parseNewProduct(G({ ...base, tags: 'x'.repeat(40) })).ok, false)
})

test('edit product: per-variant SKU, barcode, cost, weight, track; duplicate SKUs refused; fields not in the form stay untouched', () => {
  const form = (o: Record<string, string>) => G({ name: 'Tee', status: 'ACTIVE', defaultVariant: 'a', v_a_label: 'M', v_a_price: '1500', v_a_stock: '5', v_a_active: 'on', v_b_label: 'L', v_b_price: '1600', v_b_stock: '2', v_b_active: 'on', ...o })
  const r = parseProductEdit(form({ v_a_sku: 'tee-m', v_b_sku: 'TEE-L', v_a_barcode: '8964000123456', v_a_cost: '900.50', v_a_weight: '250', v_a_trackSent: '1', v_b_trackSent: '1', v_b_track: 'on', slug: 'tee-new', vendor: 'Khaadi', tags: 'a,b' }), ['a', 'b'])
  assert.ok(r.ok)
  if (r.ok) {
    const [a, b] = r.value.variants
    assert.deepEqual([a.sku, a.barcode, a.costPrice, a.weightGrams, a.trackStock], ['TEE-M', '8964000123456', 900.5, 250, false])
    assert.deepEqual([b.sku, b.trackStock, b.barcode], ['TEE-L', true, undefined])
    assert.equal(r.value.slug, 'tee-new'); assert.equal(r.value.product.vendor, 'Khaadi'); assert.deepEqual(r.value.product.tags, ['a', 'b'])
  }
  assert.match((parseProductEdit(form({ v_a_sku: 'same', v_b_sku: 'SAME' }), ['a', 'b']) as { error: string }).error, /same SKU/)
  assert.equal(parseProductEdit(form({ v_a_sku: '' }), ['a', 'b']).ok, false)
  assert.equal(parseProductEdit(form({ slug: 'Bad Slug' }), ['a', 'b']).ok, false)
  const plain = parseProductEdit(form({}), ['a', 'b'])
  assert.ok(plain.ok && plain.value.slug === undefined && plain.value.variants[0].sku === undefined && plain.value.variants[0].trackStock === undefined && plain.value.product.tags === undefined)
})
