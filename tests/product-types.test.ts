import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseNewProduct, parseProductEdit, parseStock } from '@/lib/admin/product-rules'

const form = (o: Record<string, string>) => new Map(Object.entries(o)) as unknown as { get(n: string): string | null }
const base = { name: 'Basmati Rice', status: 'DRAFT', v_price: '850', v_stock: '25' }
const np = (o: Record<string, string> = {}) => parseNewProduct(form({ ...base, ...o }))

test('simple product: counted unit, whole numbers, defaults to piece', () => {
  const r = np({ type: 'SIMPLE', v_price: '499', v_stock: '12', unitCode: 'box' })
  assert.ok(r.ok && r.value.type === 'SIMPLE' && r.value.unitCode === 'box' && r.value.variant.stock === 12 && r.value.optionGroups.length === 0 && r.value.variant.label === 'Standard')
  const d = np({ type: 'SIMPLE', v_price: '499' })
  assert.ok(d.ok && d.value.unitCode === 'piece')
  assert.ok(!np({ type: 'SIMPLE', v_price: '499.5' }).ok)
  assert.ok(!np({ type: 'SIMPLE', v_stock: '2.5' }).ok)
  assert.ok(!np({ type: 'SIMPLE', unitCode: 'kg' }).ok) // a measured unit cannot make a counted product
})

test('variants product: options build combinations; or a single named variant', () => {
  const r = np({ type: 'VARIANTS', options: 'Size: S, M\nColour: Red', v_price: '1500', v_stock: '5' })
  assert.ok(r.ok && r.value.optionGroups.length === 2 && r.value.variant.price === 1500)
  assert.ok(!np({ type: 'VARIANTS', options: 'nonsense' }).ok)
  assert.ok(!np({ type: 'VARIANTS' }).ok) // no options and no name: nothing to create
  const one = np({ type: 'VARIANTS', v_label: '100ml' })
  assert.ok(one.ok && one.value.optionGroups.length === 0 && one.value.variant.label === '100ml')
  assert.ok(np({ v_label: '100ml' }).ok) // old forms without a type still work as variants
})

test('measurable product: unit conversion to base units, price per unit with paisa', () => {
  const r = np({ type: 'MEASURABLE', unitCode: 'kg', v_price: '850.50', v_stock: '12.5', qtyMin: '0.5', qtyStep: '0.25' })
  assert.ok(r.ok)
  if (r.ok) {
    assert.equal(r.value.unitCode, 'kg'); assert.equal(r.value.variant.price, 850.5); assert.equal(r.value.variant.stock, 12500)
    assert.equal(r.value.qtyMin, 500); assert.equal(r.value.qtyStep, 250)
  }
  const defaults = np({ type: 'MEASURABLE', unitCode: 'L', v_price: '300' })
  assert.ok(defaults.ok && defaults.value.qtyStep === 500 && defaults.value.qtyMin === 500) // unit's own default step
  const g = np({ type: 'MEASURABLE', unitCode: 'g', v_price: '2', v_stock: '1500' })
  assert.ok(g.ok && g.value.variant.stock === 1500 && g.value.qtyStep === 100)
})

test('measurable product: rejects wrong or unsafe input', () => {
  const bad: Record<string, string>[] = [
    { unitCode: '' }, { unitCode: 'box' }, { unitCode: 'parsec' },
    { unitCode: 'kg', v_stock: 'abc' }, { unitCode: 'kg', v_stock: '1.2345' }, { unitCode: 'kg', v_stock: '99999999' },
    { unitCode: 'kg', v_price: '0' }, { unitCode: 'kg', v_price: '1.234' },
    { unitCode: 'kg', qtyStep: '0' }, { unitCode: 'kg', qtyStep: 'x' }, { unitCode: 'kg', qtyMin: '0.1', qtyStep: '0.25' },
    { unitCode: 'kg', qtyMin: '0.6', qtyStep: '0.25' }, // 0.6 is not a whole number of steps
  ]
  for (const o of bad) assert.ok(!np({ type: 'MEASURABLE', ...o }).ok, JSON.stringify(o))
})

test('stock parsing follows the product kind', () => {
  assert.equal(parseStock('12', { type: 'SIMPLE', unitCode: 'box' }), 12)
  assert.equal(parseStock('', { type: 'SIMPLE', unitCode: 'box' }), 0)
  assert.equal(parseStock('1.5', { type: 'SIMPLE', unitCode: 'box' }), null)
  assert.equal(parseStock('1.5', { type: 'MEASURABLE', unitCode: 'kg' }), 1500)
  assert.equal(parseStock('0', { type: 'MEASURABLE', unitCode: 'kg' }), 0)
  assert.equal(parseStock('', { type: 'MEASURABLE', unitCode: 'kg' }), 0)
  assert.equal(parseStock('2,5', { type: 'MEASURABLE', unitCode: 'L' }), 2500)
  assert.equal(parseStock('-1', { type: 'MEASURABLE', unitCode: 'kg' }), null)
})

const edit = (o: Record<string, string>, meta = { type: 'MEASURABLE' as const, unitCode: 'kg' }) =>
  parseProductEdit(form({ name: 'Rice', status: 'ACTIVE', defaultVariant: 'a', v_a_label: 'Std', v_a_price: '850', v_a_stock: '12.5', v_a_stockWas: '12500', v_a_stockShown: '12.5', v_a_active: 'on', ...o }), ['a'], meta, { qtyMin: 500, qtyStep: 250 })

test('editing a measured product: stock in kg, untouched stock stays exact, min/step kept when absent', () => {
  const r = edit({})
  assert.ok(r.ok && r.value.variants[0].stock === 12500 && r.value.qtyMin === 500 && r.value.qtyStep === 250 && r.value.unitCode === 'kg')
  const changed = edit({ v_a_stock: '20' })
  assert.ok(changed.ok && changed.value.variants[0].stock === 20000)
  // a unit that cannot round-trip through 3 decimals: untouched means untouched
  const odd = edit({ v_a_stock: '85.735', v_a_stockShown: '85.735', v_a_stockWas: '1000' }, { type: 'MEASURABLE', unitCode: 'tola' })
  assert.ok(odd.ok && odd.value.variants[0].stock === 1000)
  const newMin = edit({ qtyMin: '1', qtyStep: '0.5' })
  assert.ok(newMin.ok && newMin.value.qtyMin === 1000 && newMin.value.qtyStep === 500)
  assert.ok(!edit({ qtyMin: '0.1' }).ok)
  assert.ok(!edit({ v_a_price: '0' }).ok)
})

test('editing counted products keeps whole numbers and can change the counting unit', () => {
  const m = { type: 'SIMPLE' as const, unitCode: 'piece' }
  const r = edit({ v_a_stock: '7', v_a_stockShown: '7', v_a_stockWas: '7', unitCode: 'bag' }, m)
  assert.ok(r.ok && r.value.unitCode === 'bag' && r.value.variants[0].stock === 7 && r.value.qtyMin === null)
  assert.ok(!edit({ v_a_stock: '7.5', unitCode: 'bag' }, m).ok)
  assert.ok(!edit({ v_a_price: '9.5', unitCode: 'bag' }, m).ok)
  assert.ok(!edit({ unitCode: 'kg' }, m).ok)
})
