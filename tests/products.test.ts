import { parseProductEdit } from '@/lib/admin/product-rules'
import assert from 'node:assert/strict'
import { test } from 'node:test'

test('products rules', () => {
const G = (o) => ({ get: (k) => (k in o ? o[k] : null) })
const base = { name:'Darwaish Oil', status:'ACTIVE', defaultVariant:'a', v_a_label:'30ml', v_a_price:'1500', v_a_stock:'90', v_a_stockWas:'100', v_a_active:'on', v_b_label:'100ml', v_b_price:'2500', v_b_compareAt:'3000', v_b_stock:'5', v_b_stockWas:'5', v_b_active:'on', v_b_badge:'Popular' }
let r = parseProductEdit(G(base), ['a','b']); assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.value.variants[0].stock - r.value.variants[0].stockWas, -10); assert.equal(r.value.variants[1].compareAtPrice, 3000); assert.equal(r.value.variants[1].badge,'Popular')
const bad = (o, msg) => { const x = parseProductEdit(G({...base, ...o}), ['a','b']); assert.ok(!x.ok, msg) }
bad({v_a_price:'0'}, 'zero price'); bad({v_a_price:'15.5'}, 'decimal'); bad({v_b_compareAt:'100'}, 'compare below price'); bad({v_a_stock:'-1'}, 'negative stock')
bad({defaultVariant:'zzz'}, 'unknown default'); bad({defaultVariant:'a', v_a_active:''}, 'default switched off'); bad({name:'x'}, 'short name'); bad({status:'HACK'}, 'status')
assert.ok(!parseProductEdit(G({...base, v_a_active:'', v_b_active:'', defaultVariant:'b'}), ['a','b']).ok, 'live with no active sizes')
assert.ok(parseProductEdit(G({...base, status:'DRAFT', v_a_active:'on', v_b_active:''}), ['a','b']).ok)
// tampered variant ids in the form are ignored: only server-provided ids are read
assert.equal(parseProductEdit(G({...base, v_evil_price:'1'}), ['a','b']).value.variants.length, 2)

})

import { slugify, uniqueSlug, parseNewProduct, parseVariantFields, parseSections, parseSectionItems, sectionItemsToText } from '@/lib/admin/product-rules'
const GG = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k] : null) })
test('slugs', () => {
  assert.equal(slugify('Darwaish Sacred Oil!'), 'darwaish-sacred-oil'); assert.equal(slugify('  Ünï  Cödé  '), 'uni-code'); assert.equal(slugify('علی'), 'product'); assert.equal(slugify('x'.repeat(100)).length, 60)
  assert.equal(uniqueSlug('oil', new Set()), 'oil'); assert.equal(uniqueSlug('oil', new Set(['oil', 'oil-2'])), 'oil-3')
})
const newBase = { name: 'Rose Water', status: 'DRAFT', v_label: '100ml', v_price: '900', v_stock: '20' }
test('new product: valid, with defaults, and rejections', () => {
  const r = parseNewProduct(GG(newBase)); assert.ok(r.ok); if (r.ok) { assert.equal(r.value.slug, 'rose-water'); assert.equal(r.value.variant.stock, 20); assert.equal(r.value.product.categoryId, null) }
  for (const bad of [{ name: 'x' }, { status: 'LIVE' }, { v_label: '' }, { v_price: '0' }, { v_price: '9.5' }, { v_compareAt: '1' }, { v_sku: 'bad sku!' }, { slug: 'Bad Slug' }, { description: 'x'.repeat(10_001) }, { categoryId: '../x' }])
    assert.ok(!parseNewProduct(GG({ ...newBase, ...bad })).ok, JSON.stringify(bad))
  assert.equal(parseVariantFields(GG({ label: '5L', price: '100', stock: '' })).ok, true)
})
test('sections: items text round trip, pairs, drop empty, errors', () => {
  assert.deepEqual(parseSectionItems('FAQ', 'Is it safe? | Yes\nPlain'), [{ title: 'Is it safe?', text: 'Yes' }, { title: 'Plain' }])
  assert.deepEqual(parseSectionItems('CHECKLIST', ' a \n\n b '), [{ text: 'a' }, { text: 'b' }])
  assert.equal(sectionItemsToText('CARDS', [{ title: 'T', text: 'X' }]), 'T | X'); assert.equal(sectionItemsToText('STEPS', [{ text: 'one' }]), 'one')
  const ok = parseSections(GG({ s0_type: 'FAQ', s0_title: 'Questions', s0_items: 'Q? | A', s0_tab: 'Q & A!', s0_visible: 'on', s1_type: 'CARDS', s2_type: 'BULLETS', s2_title: 'Gone', s2_items: 'x', s2_remove: 'on' }), 3)
  assert.ok(ok.ok); if (ok.ok) { assert.equal(ok.value.length, 1); assert.equal(ok.value[0].tab, 'q-a'); assert.equal(ok.value[0].isVisible, true) }
  assert.ok(!parseSections(GG({ s0_type: 'FAQ', s0_title: 'No items', s0_items: '' }), 1).ok, 'heading without content')
  assert.ok(!parseSections(GG({ s0_type: 'FAQ', s0_title: 'T', s0_items: '  \n ' }), 1).ok, 'blank lines only')
  assert.ok(!parseSections(GG({ s0_type: 'FAQ', s0_title: '', s0_items: 'x' }), 1).ok, 'content without heading')
  assert.ok(!parseSections(GG({ s0_type: 'NOPE', s0_title: 'T', s0_items: 'x' }), 1).ok)
  assert.ok(!parseSections(GG({ s0_type: 'FAQ', s0_title: '', s0_items: 'x' }), 1).ok)
})

import { parseCategory } from '@/lib/admin/category-rules'
test('categories: validation', () => {
  const ok = parseCategory(GG({ name: ' Hair Oils ', isActive: 'on' })); assert.ok(ok.ok && ok.value.slug === null && ok.value.sortOrder === 0 && ok.value.isActive)
  for (const bad of [{ name: 'x' }, { name: 'ok', slug: 'Bad Slug' }, { name: 'ok', sortOrder: '-1' }, { name: 'ok', sortOrder: '1.5' }, { name: 'x'.repeat(61) }]) assert.ok(!parseCategory(GG(bad)).ok, JSON.stringify(bad))
})
