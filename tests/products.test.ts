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
