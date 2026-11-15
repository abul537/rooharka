import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MAX_CART_LINES, addToCart, cleanCart, itemsParam, parseCart, readItems, removeFromCart, setCartQuantity } from '@/lib/cart'
import { describeDiscount, discountCut, discountProblem, parseDiscountCode, parseDiscountForm, type DiscountRule } from '@/lib/discounts'
import { buildPaymentOptions, computeCharges, type PricingConfig } from '@/lib/pricing'

const A = 'cmw6nl8o0000h7ctth6ql2ovc', B = 'cmw6nl8o0001h7ctabcdefghi'
const config: PricingConfig = { paymentPolicy: 'COD_ONLY', deliveryCharge: 200, freeDeliveryOver: 5000, advanceMode: 'DELIVERY_CHARGE', advanceValue: null, wallets: [] }

test('cart: only real-looking ids and whole positive quantities survive, with no duplicates and at most 20 lines', () => {
  assert.deepEqual(cleanCart([{ variantId: A, quantity: 2 }, { variantId: A, quantity: 9 }, { variantId: 'x', quantity: 1 }, { variantId: B, quantity: 0 }, { variantId: B, quantity: 1.5 }, null, 'junk', { variantId: B, quantity: 3 }]), [{ variantId: A, quantity: 2 }, { variantId: B, quantity: 3 }])
  assert.deepEqual(cleanCart('nope'), []); assert.deepEqual(parseCart('{broken'), []); assert.deepEqual(parseCart(null), [])
  assert.deepEqual(parseCart(JSON.stringify([{ variantId: A, quantity: 1, price: 1 }])), [{ variantId: A, quantity: 1 }], 'a price in storage is ignored: prices come from the shop')
  const many = Array.from({ length: 30 }, (_, i) => ({ variantId: `variant${String(i).padStart(4, '0')}`, quantity: 1 }))
  assert.equal(cleanCart(many).length, MAX_CART_LINES)
})

test('cart: adding the same size raises its quantity; a full cart says so', () => {
  let r = addToCart([], A, 2); assert.deepEqual(r, { cart: [{ variantId: A, quantity: 2 }], added: true })
  r = addToCart(r.cart, A, 3); assert.deepEqual(r.cart, [{ variantId: A, quantity: 5 }])
  r = addToCart(r.cart, B, 1); assert.equal(r.cart.length, 2)
  assert.equal(addToCart(r.cart, 'bad id', 1).added, false); assert.equal(addToCart(r.cart, B, 0).added, false)
  const full = Array.from({ length: MAX_CART_LINES }, (_, i) => ({ variantId: `variant${String(i).padStart(4, '0')}`, quantity: 1 }))
  assert.equal(addToCart(full, A, 1).added, false); assert.equal(addToCart(full, full[3].variantId, 1).added, true, 'more of something already in a full cart is fine')
  assert.deepEqual(setCartQuantity(r.cart, A, 1)[0], { variantId: A, quantity: 1 }); assert.deepEqual(setCartQuantity(r.cart, A, -4), r.cart)
  assert.deepEqual(removeFromCart(r.cart, A), [{ variantId: B, quantity: 1 }])
})

test('cart: the checkout address carries ids and quantities only, in both forms', () => {
  const cart = [{ variantId: A, quantity: 2 }, { variantId: B, quantity: 1 }]
  assert.equal(itemsParam(cart), `${A}:2,${B}:1`)
  assert.deepEqual(readItems({ items: itemsParam(cart) }), cart)
  assert.deepEqual(readItems({ variant: A, qty: '3' }), [{ variantId: A, quantity: 3 }], 'the "Order now" form still works')
  assert.deepEqual(readItems({ variant: A }), [{ variantId: A, quantity: 1 }]); assert.deepEqual(readItems({ variant: A, qty: 'lots' }), [{ variantId: A, quantity: 1 }])
  for (const junk of [{}, { items: '' }, { items: ',,,' }, { items: '<script>:1' }, { items: `${A}:-2` }, { variant: '../admin' }]) assert.deepEqual(readItems(junk).filter((i) => i.quantity < 1 || !/^[A-Za-z0-9_-]+$/.test(i.variantId)), [], JSON.stringify(junk))
  assert.deepEqual(readItems({ items: `${A}:x` }), [{ variantId: A, quantity: 1 }])
})

const code = (o: Partial<DiscountRule> = {}): DiscountRule => ({ code: 'EID10', kind: 'PERCENT', value: 10, minSubtotal: 0, maxUses: null, usedCount: 0, oncePerCustomer: false, startsAt: null, endsAt: null, isActive: true, ...o })

test('discount codes: how they are typed, and when they work', () => {
  assert.equal(parseDiscountCode(' eid-10 '), 'EID10'); assert.equal(parseDiscountCode('Summer Sale 25'), 'SUMMERSALE25')
  for (const bad of ['', 'ab', 'x'.repeat(21), 'EID_10', 'عید', 5, null, '<b>']) assert.equal(parseDiscountCode(bad), null, String(bad))
  const now = new Date('2026-11-20T10:00:00+05:00')
  assert.equal(discountProblem(code(), 1000, now), null)
  assert.match(discountProblem(code({ isActive: false }), 1000, now)!, /not valid/)
  assert.match(discountProblem(code({ startsAt: new Date('2026-11-21T00:00:00+05:00') }), 1000, now)!, /not active yet/)
  assert.match(discountProblem(code({ endsAt: new Date('2026-11-19T23:59:59+05:00') }), 1000, now)!, /expired/)
  assert.equal(discountProblem(code({ endsAt: new Date('2026-11-20T23:59:59+05:00') }), 1000, now), null, 'the last day counts until midnight')
  assert.match(discountProblem(code({ maxUses: 5, usedCount: 5 }), 1000, now)!, /used up/); assert.equal(discountProblem(code({ maxUses: 5, usedCount: 4 }), 1000, now), null)
  assert.match(discountProblem(code({ minSubtotal: 2000 }), 1999, now)!, /at least Rs\. 2,000/); assert.equal(discountProblem(code({ minSubtotal: 2000 }), 2000, now), null)
  assert.match(discountProblem(code(), 1000, now, true)!, /already used/)
})

test('discount codes: what they take off, and it flows into the same totals the server charges', () => {
  assert.deepEqual(discountCut(code(), 2550), { amount: 255, freeDelivery: false })
  assert.deepEqual(discountCut(code({ kind: 'FIXED', value: 300 }), 2000), { amount: 300, freeDelivery: false })
  assert.deepEqual(discountCut(code({ kind: 'FIXED', value: 300 }), 120), { amount: 120, freeDelivery: false }, 'never more than the products cost')
  assert.deepEqual(discountCut(code({ kind: 'PERCENT', value: 500 }), 1000), { amount: 900, freeDelivery: false }, 'a percentage is capped at 90')
  assert.deepEqual(discountCut(code({ kind: 'FREE_DELIVERY' }), 1000), { amount: 0, freeDelivery: true })
  assert.deepEqual([describeDiscount(code()), describeDiscount(code({ kind: 'FIXED', value: 1500 })), describeDiscount(code({ kind: 'FREE_DELIVERY' }))], ['10% off', 'Rs. 1,500 off', 'Free delivery'])
  // Totals.
  assert.deepEqual(computeCharges(config, 2000, 'COD'), { subtotal: 2000, discount: 0, delivery: 200, total: 2200, advance: 0, dueOnDelivery: 2200 })
  assert.deepEqual(computeCharges(config, 2000, 'COD', { amount: 200, freeDelivery: false }), { subtotal: 2000, discount: 200, delivery: 200, total: 2000, advance: 0, dueOnDelivery: 2000 })
  assert.deepEqual(computeCharges(config, 2000, 'COD', { amount: 0, freeDelivery: true }), { subtotal: 2000, discount: 0, delivery: 0, total: 2000, advance: 0, dueOnDelivery: 2000 })
  assert.equal(computeCharges(config, 5200, 'COD', { amount: 520, freeDelivery: false }).delivery, 0, 'free delivery over Rs. 5,000 is judged before the discount')
  assert.equal(computeCharges(config, 500, 'COD', { amount: 9999, freeDelivery: false }).total, 200, 'a discount cannot make the total negative')
  // A prepaid order's advance follows the discounted total.
  const prepaid: PricingConfig = { ...config, paymentPolicy: 'FULL_ADVANCE', wallets: [{ provider: 'JAZZCASH', accountTitle: 'A', accountNumber: '0300' }] }
  assert.equal(buildPaymentOptions(prepaid, 2000, { amount: 200, freeDelivery: false })[0].charges.advance, 2000)
})

test('discount form: a code can never make an order free', () => {
  const form = (o: Record<string, string>) => parseDiscountForm((k) => o[k])
  const ok = form({ code: 'eid10', kind: 'PERCENT', value: '10', isActive: 'on', startsAt: '2026-11-20', endsAt: '2026-11-25' })
  assert.ok(ok.ok); if (ok.ok) { assert.equal(ok.value.code, 'EID10'); assert.equal(ok.value.startsAt!.toISOString(), '2026-11-19T19:00:00.000Z'); assert.equal(ok.value.endsAt!.toISOString(), '2026-11-25T18:59:59.000Z'); assert.equal(ok.value.maxUses, null) }
  for (const [bad, why] of [
    [{ code: 'x', kind: 'PERCENT', value: '10' }, /3 to 20/], [{ code: 'EID', kind: 'HALF', value: '10' }, /Choose what/], [{ code: 'EID', kind: 'PERCENT', value: '95' }, /1 to 90/], [{ code: 'EID', kind: 'PERCENT', value: '' }, /1 to 90/],
    [{ code: 'EID', kind: 'FIXED', value: '500' }, /minimum order at least as large/], [{ code: 'EID', kind: 'FIXED', value: '500', minSubtotal: '400' }, /minimum order at least as large/],
    [{ code: 'EID', kind: 'PERCENT', value: '10', maxUses: '0' }, /number of uses/], [{ code: 'EID', kind: 'PERCENT', value: '10', startsAt: '2026-11-25', endsAt: '2026-11-20' }, /cannot be before/], [{ code: 'EID', kind: 'PERCENT', value: '10', endsAt: 'tomorrow' }, /as a day/],
  ] as const) { const r = form(bad as Record<string, string>); assert.ok(!r.ok && why.test(r.error), JSON.stringify(bad)) }
  assert.ok(form({ code: 'EID', kind: 'FIXED', value: '500', minSubtotal: '500' }).ok); assert.ok(form({ code: 'FREESHIP', kind: 'FREE_DELIVERY' }).ok)
})

test('cart and discounts on the server: this store only, prices from the database, the code claimed atomically', () => {
  const order = readFileSync('lib/orders/create-order.ts', 'utf8')
  assert.match(order, /discount = await findDiscount\(storeId, input\.discountCode\)/)
  assert.match(order, /buildPaymentOptions\(config\.pricing, subtotal, cut\)/, 'the total the customer pays is computed on the server with the code')
  assert.match(order, /UPDATE "Discount" SET "usedCount" = "usedCount" \+ 1 WHERE "id" = \$\{discount\.id\} AND "storeId" = \$\{storeId\} AND "isActive" = true AND \("maxUses" IS NULL OR "usedCount" < "maxUses"\)/)
  assert.ok(order.indexOf('UPDATE "Discount"') > order.indexOf('db.$transaction(async (tx)'), 'claimed inside the order’s transaction: an order that fails gives the use back')
  assert.match(order, /discount: charges\.discount,\s*discountCode: discount\?\.code \?\? null/)
  assert.match(readFileSync('lib/discounts-data.ts', 'utf8'), /where: \{ storeId_code: \{ storeId, code \} \}/)
  const api = readFileSync('app/api/discount/route.ts', 'utf8')
  assert.match(api, /rateLimit\(`discount:\$\{clientIp\(request\.headers\)\}`, 10, 60_000\)/, 'codes cannot be guessed quickly')
  const cart = readFileSync('app/api/cart/route.ts', 'utf8')
  assert.match(cart, /loadCheckoutEntries\(store\.id, config\.maxQuantity, items\)/); assert.match(cart, /cleanCart\(body\?\.items\)/)
  assert.match(readFileSync('lib/data/checkout.ts', 'utf8'), /where: \{ id: variantId, isActive: true, product: \{ storeId, status: 'ACTIVE' \} \}/, 'a size of another shop is simply not found')
  const actions = readFileSync('app/admin/(panel)/discounts/actions.ts', 'utf8')
  assert.equal([...actions.matchAll(/export async function/g)].length, [...actions.matchAll(/adminOrError\('settings\.edit'\)/g)].length)
  for (const q of actions.matchAll(/db\.discount\.\w+\(\{ (where|data): \{([^}]*)/g)) assert.match(q[2], /storeId/, q[0])
  // The checkout sends ids and quantities, never prices.
  const flow = readFileSync('app/(shop)/checkout/CheckoutFlow.tsx', 'utf8')
  assert.match(flow, /const items = lines\.map\(\(e\) => \(\{ variantId: e\.line\.variantId, quantity: e\.quantity \}\)\)/)
  assert.doesNotMatch(flow.slice(flow.indexOf("fetch('/api/orders'"), flow.indexOf('const data = await res.json()')), /unitPrice|total|subtotal/)
})

// ------------------------------------------------------------------ advertising pixels
import { NO_PIXELS, parsePixelsForm, pixelScript, readPixels } from '@/lib/pixels'

test('pixel ids are checked strictly, because they are written into the page', () => {
  const good = { meta: '1234567890123456', tiktok: 'CABCDEFGHIJ123456789', ga4: 'G-ABC123XYZ9' }
  assert.deepEqual(readPixels({ pixels: good }), good); assert.deepEqual(readPixels(null), NO_PIXELS)
  for (const evil of ["123');alert(1);//", '</script><script>alert(1)</script>', '1234567890 ', 'G-abc', 'UA-12345-1', "');fetch('//evil')//"]) {
    assert.deepEqual(readPixels({ pixels: { meta: evil, tiktok: evil, ga4: evil } }), NO_PIXELS, evil)
    assert.equal(pixelScript({ meta: evil, tiktok: evil, ga4: evil }), '', 'nothing unchecked ever reaches the script')
  }
  const form = (o: Record<string, string>) => parsePixelsForm((k) => o[k])
  assert.deepEqual(form({ meta: ' 1234567890123456 ', tiktok: '', ga4: 'g-abc123xyz9' }), { ok: true, value: { meta: '1234567890123456', tiktok: '', ga4: 'G-ABC123XYZ9' } })
  const bad = form({ meta: 'my pixel' }); assert.ok(!bad.ok && /Meta Pixel ID/.test(bad.error))
  const script = pixelScript(good)
  for (const part of ["fbq('init','1234567890123456')", "ttq.load('CABCDEFGHIJ123456789')", "gtag('config','G-ABC123XYZ9')", 'connect.facebook.net', 'analytics.tiktok.com', 'googletagmanager.com']) assert.ok(script.includes(part), part)
  assert.equal(pixelScript({ ...NO_PIXELS, ga4: good.ga4 }).includes('fbq'), false, 'only the connected pixels load')
  const layout = readFileSync('app/(shop)/layout.tsx', 'utf8')
  assert.match(layout, /\{!preview && hasPixels\(ctx\.pixels\) &&/, 'never in the owner’s preview')
  const flow = readFileSync('app/(shop)/checkout/CheckoutFlow.tsx', 'utf8')
  assert.match(flow, /track\('Purchase', \{ value: data\.total/); assert.match(flow, /track\('InitiateCheckout'/)
  assert.match(readFileSync('components/product/PurchasePanel.tsx', 'utf8'), /track\('AddToCart'/)
  assert.doesNotMatch(readFileSync('lib/pixels-client.ts', 'utf8'), /phone|email|address|customer/i, 'no personal detail is ever sent to a pixel')
})
