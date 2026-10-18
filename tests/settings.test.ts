import * as r from '@/lib/admin/settings-rules'
import assert from 'node:assert/strict'
import { test } from 'node:test'

test('settings rules', () => {
const G = (o) => ({ get: (k) => (k in o ? o[k] : null) })
// store info
assert.deepEqual(r.parseStoreInfo(G({displayName:' MPPMHK ',supportPhone:'+92 300 1234567',supportWhatsapp:'',supportEmail:'a@b.pk'})).value, {displayName:'MPPMHK',supportPhone:'03001234567',supportWhatsapp:null,supportEmail:'a@b.pk'})
for (const bad of [{displayName:'A'},{displayName:'Ok',supportPhone:'123'},{displayName:'Ok',supportEmail:'nope'}]) assert.ok(!r.parseStoreInfo(G(bad)).ok)
// payments
const pay = (o) => r.parsePaymentSettings(G(o))
assert.ok(pay({paymentPolicy:'COD_ONLY',deliveryCharge:'200'}).ok)
assert.ok(!pay({paymentPolicy:'FULL_ADVANCE',deliveryCharge:'200'}).ok, 'advance policy needs a wallet')
let p = pay({paymentPolicy:'DELIVERY_ADVANCE',deliveryCharge:'250',freeDeliveryOver:'5000',advanceAmountMode:'PERCENT',advanceAmountValue:'20',jazzcashEnabled:'on',jazzcashNumber:'0300-1234567',jazzcashTitle:'Ali Raza'})
assert.ok(p.ok); assert.equal(p.value.wallets.jazzcash.accountNumber,'03001234567'); assert.equal(p.value.freeDeliveryOver,5000); assert.equal(p.value.advanceAmountValue,20)
assert.ok(!pay({paymentPolicy:'DELIVERY_ADVANCE',advanceAmountMode:'PERCENT',advanceAmountValue:'150',jazzcashEnabled:'on',jazzcashNumber:'03001234567',jazzcashTitle:'Ali'}).ok)
assert.ok(!pay({paymentPolicy:'DELIVERY_ADVANCE',advanceAmountMode:'FIXED',jazzcashEnabled:'on',jazzcashNumber:'03001234567',jazzcashTitle:'Ali'}).ok, 'fixed needs value')
assert.ok(!pay({paymentPolicy:'COD_ONLY',deliveryCharge:'-5'}).ok); assert.ok(!pay({paymentPolicy:'COD_ONLY',deliveryCharge:'1e3'}).ok); assert.ok(!pay({paymentPolicy:'HACK'}).ok)
assert.ok(!pay({paymentPolicy:'CUSTOMER_CHOICE',easypaisaEnabled:'on',easypaisaNumber:'12',easypaisaTitle:'X'}).ok)
assert.equal(pay({paymentPolicy:'COD_ONLY',deliveryCharge:'',jazzcashEnabled:'on',jazzcashNumber:'03001234567',jazzcashTitle:'Ali'}).value.deliveryCharge, 0)
// checkout fields: locked can't be disabled/optional even if the form is tampered with
const f = r.parseCheckoutFields(G({firstNameEnabled:'',phoneRequired:'',lastNameEnabled:'on',lastNameRequired:'on',emailRequired:'on',landmarkEnabled:'on'})).value
const by = Object.fromEntries(f.map(x=>[x.fieldKey,x]))
assert.ok(by.firstName.enabled && by.firstName.required && by.phone.required && by.province.enabled && by.locality.required)
assert.ok(by.lastName.enabled && by.lastName.required); assert.ok(!by.email.enabled && !by.email.required, 'required ignored when hidden'); assert.ok(by.landmark.enabled && !by.landmark.required); assert.ok(!by.addressType.enabled)
assert.ok(!r.parseCheckoutFields(G({emailLabel:'x'.repeat(41)})).ok)
// tracking
assert.deepEqual(r.parseTracking(G({orderTrackingEnabled:'on'})).value, {orderTrackingEnabled:true,trackingRequiresPhoneLast4:false})
// product page
const pp = r.parseProductPage(G({showReviews:'on',lowStockThreshold:'5',maxQuantity:'4',trustText0:'Free delivery',trustIcon0:'truck',trustText1:'',trustText2:'Safe',trustIcon2:'bogus'}))
assert.ok(pp.ok); assert.deepEqual(pp.value.trustBadges,[{icon:'truck',text:'Free delivery'},{icon:'shield',text:'Safe'}]); assert.equal(pp.value.showFaq,false); assert.equal(pp.value.buyButtonLabel,'Order Now')
assert.ok(!r.parseProductPage(G({maxQuantity:'0'})).ok); assert.ok(!r.parseProductPage(G({lowStockThreshold:'abc'})).ok)

})
