import { validateOrderRequest } from '@/lib/orders/validate'
import { validateName, validatePakistaniPhone } from '@/lib/validation'
import { buildPaymentOptions } from '@/lib/pricing'
import assert from 'node:assert/strict'
import { test } from 'node:test'

test('checkout rules', () => {
const fields = { firstName:{enabled:true,required:true,label:''}, lastName:{enabled:true,required:false,label:''}, email:{enabled:true,required:false,label:''}, phone:{enabled:true,required:true,label:''}, province:{enabled:true,required:true,label:''}, city:{enabled:true,required:true,label:''}, locality:{enabled:true,required:true,label:''}, landmark:{enabled:true,required:false,label:''}, addressType:{enabled:true,required:false,label:''} }
const body = (o={}) => ({ items:[{variantId:'v1',quantity:2}], customer:{firstName:'Abdul-Rehman',lastName:'',email:'',phone:'+92 300 1234567'}, address:{provinceId:'1',cityId:'5',localityId:'77',landmark:'',addressType:'home'}, paymentMethod:'COD', idempotencyKey:'a1b2c3d4-e5f6-7890-abcd-ef1234567890', ...o })
// good order with optional fields empty, hyphen name, +92 phone
let r = validateOrderRequest(body(), fields); assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.value.customer.phone,'+923001234567'); assert.equal(r.value.customer.lastName,null)
// Urdu name accepted, digits rejected
assert.equal(validateName('علی رضا'), null); assert.ok(validateName('Ali123')); assert.ok(validateName('A'))
// phones
for (const p of ['03001234567','0300-1234567','+923001234567','923001234567']) assert.equal(validatePakistaniPhone(p), null, p)
for (const p of ['','0123456789','03001234','+9230012345678']) assert.ok(validatePakistaniPhone(p), p)
// missing address pieces / bad payment / tid
r = validateOrderRequest(body({address:{provinceId:'',cityId:'',localityId:''}}), fields); assert.ok(!r.ok && r.errors.province && r.errors.city && r.errors.locality)
r = validateOrderRequest(body({paymentMethod:'JAZZCASH'}), fields); assert.ok(!r.ok && r.errors.transactionId)
r = validateOrderRequest(body({paymentMethod:'JAZZCASH',transactionId:'T123456789'}), fields); assert.ok(r.ok && r.value.transactionId==='T123456789')
r = validateOrderRequest(body({paymentMethod:'BITCOIN'}), fields); assert.ok(!r.ok && r.errors.paymentMethod)
// store makes email + landmark required
const strict = {...fields, email:{...fields.email,required:true}, landmark:{...fields.landmark,required:true}}
r = validateOrderRequest(body(), strict); assert.ok(!r.ok && r.errors.email && r.errors.landmark)
// hostile input
r = validateOrderRequest(body({items:[{variantId:'v1',quantity:-5}]}), fields); assert.ok(!r.ok && r.errors.items)
r = validateOrderRequest(null, fields); assert.ok(!r.ok)
r = validateOrderRequest(body({idempotencyKey:'x'}), fields); assert.ok(!r.ok && r.errors.idempotencyKey)
// policies, Rs 2500 order, Rs 200 delivery
const base = {deliveryCharge:200,freeDeliveryOver:null,advanceMode:'DELIVERY_CHARGE',advanceValue:null,wallets:[{provider:'JAZZCASH',accountNumber:'0300',accountTitle:'X'},{provider:'EASYPAISA',accountNumber:'0301',accountTitle:'X'}]}
let o = buildPaymentOptions({...base,paymentPolicy:'COD_ONLY'},2500); assert.deepEqual(o.map(x=>x.method),['COD']); assert.equal(o[0].charges.total,2700)
o = buildPaymentOptions({...base,paymentPolicy:'DELIVERY_ADVANCE'},2500); assert.deepEqual(o.map(x=>x.method),['JAZZCASH','EASYPAISA']); assert.equal(o[0].charges.advance,200); assert.equal(o[0].charges.dueOnDelivery,2500)
o = buildPaymentOptions({...base,paymentPolicy:'FULL_ADVANCE'},2500); assert.equal(o[0].charges.advance,2700); assert.equal(o[0].charges.dueOnDelivery,0)
o = buildPaymentOptions({...base,paymentPolicy:'CUSTOMER_CHOICE'},2500); assert.deepEqual(o.map(x=>x.method),['COD','JAZZCASH','EASYPAISA'])
o = buildPaymentOptions({...base,paymentPolicy:'FULL_ADVANCE',wallets:[]},2500); assert.equal(o.length,0) // no wallet set up -> checkout explains
o = buildPaymentOptions({...base,paymentPolicy:'DELIVERY_ADVANCE',freeDeliveryOver:2000},2500); assert.deepEqual(o.map(x=>x.method),['COD']) // free delivery => nothing to prepay
o = buildPaymentOptions({...base,paymentPolicy:'DELIVERY_ADVANCE',advanceMode:'PERCENT',advanceValue:10},2500); assert.equal(o[0].charges.advance,270)

})
