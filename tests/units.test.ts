import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UNITS, convert, formatQuantity, fromBase, getUnit, isMeasured, parseAmount, perUnit, toBase } from '@/lib/units/registry'
import { MAX_BASE_QUANTITY, isBuyable, lineTotal, quantityProblem, quantityRule, snapQuantity, stepQuantity } from '@/lib/units/quantity'
import { combinations, comboKey, type ExistingVariant, optionGroupsToText, parseOptionGroups, planGeneration, readOptionGroups, readOptionValues, skuFor, variantLabel } from '@/lib/variants/rules'

test('unit registry: codes are unique, every unit has a dimension and a positive factor', () => {
  assert.equal(new Set(UNITS.map((u) => u.code)).size, UNITS.length)
  for (const u of UNITS) { assert.ok(u.factor > 0 && u.defaultStep > 0, u.code); if (u.dimension === 'COUNT') assert.equal(u.factor, 1, u.code) }
  assert.equal(isMeasured('kg'), true); assert.equal(isMeasured('box'), false); assert.equal(isMeasured(null), false); assert.equal(isMeasured('nope'), false)
})

test('conversion stays inside one dimension and is exact for metric units', () => {
  assert.equal(toBase(1.25, 'kg'), 1250); assert.equal(toBase(0.5, 'L'), 500); assert.equal(toBase(2.5, 'm'), 2500)
  assert.equal(fromBase(1250, 'kg'), 1.25); assert.equal(fromBase(250, 'g'), 250)
  assert.equal(convert(1.5, 'kg', 'g'), 1500); assert.equal(convert(250, 'mL', 'L'), 0.25); assert.equal(convert(1, 'm', 'cm'), 100)
  assert.equal(convert(1, 'kg', 'L'), null); assert.equal(convert(1, 'kg', 'box'), null); assert.equal(convert(1, 'x', 'kg'), null)
  assert.equal(convert(1, 'seer', 'g'), 933.1); assert.equal(toBase(1, 'tola'), 12) // whole base units: 11.66 g rounds to 12
  assert.throws(() => toBase(1, 'nope'))
})

test('typed amounts: decimals and commas ok, junk rejected', () => {
  assert.equal(parseAmount('1.25', 'kg'), 1.25); assert.equal(parseAmount(' 2 ', 'kg'), 2); assert.equal(parseAmount('0,5', 'L'), 0.5)
  for (const bad of ['', '0', '-1', 'abc', '1.2345', '1e3', '1.', '.5', '99999999']) assert.equal(parseAmount(bad, 'kg'), null, bad)
  assert.equal(parseAmount('1', 'nope'), null)
})

test('quantity text reads naturally', () => {
  assert.equal(formatQuantity(250, 'kg'), '250 g'); assert.equal(formatQuantity(1000, 'kg'), '1 kg'); assert.equal(formatQuantity(1500, 'kg'), '1.5 kg')
  assert.equal(formatQuantity(750, 'L'), '750 mL'); assert.equal(formatQuantity(2500, 'm'), '2.5 m'); assert.equal(formatQuantity(450, 'm'), '45 cm')
  assert.equal(formatQuantity(1, 'box'), '1 box'); assert.equal(formatQuantity(3, 'box'), '3 boxes'); assert.equal(formatQuantity(3, 'piece'), '3'); assert.equal(formatQuantity(3, null), '3')
  assert.equal(formatQuantity(1866, 'seer'), '2 seer'); assert.equal(perUnit('kg'), 'per kg'); assert.equal(perUnit('box'), 'per box'); assert.equal(perUnit('piece'), null); assert.equal(perUnit(null), null)
})

test('line total: counted = price x qty, measured = price per unit x quantity / factor, rounded to a whole rupee', () => {
  assert.equal(lineTotal(499, 3, null), 1497); assert.equal(lineTotal(499, 3, 'piece'), 1497); assert.equal(lineTotal(200, 2, 'box'), 400)
  assert.equal(lineTotal(850, 1250, 'kg'), 1063); assert.equal(lineTotal(850, 250, 'kg'), 213); assert.equal(lineTotal(333, 333, 'kg'), 111)
  assert.equal(lineTotal(60, 2500, 'm'), 150); assert.equal(lineTotal(1, 1, 'kg'), 0) // 0.001 rounds to 0: why a minimum order exists
})

const rice = { type: 'MEASURABLE', unitCode: 'kg', qtyMin: 500, qtyStep: 250 }
test('measured rule: minimum, step, stock limit', () => {
  const r = quantityRule(rice, 2200, 10)
  assert.deepEqual(r, { unit: 'kg', measured: true, min: 500, step: 250, max: 2200 })
  assert.equal(snapQuantity(r, 100), 500); assert.equal(snapQuantity(r, 620), 500); assert.equal(snapQuantity(r, 640), 750); assert.equal(snapQuantity(r, 99999), 2000) // 2200 -> last whole step 2000
  assert.equal(stepQuantity(r, 500, -1), 500); assert.equal(stepQuantity(r, 500, 1), 750); assert.equal(stepQuantity(r, 2000, 1), 2000)
  assert.equal(quantityProblem(r, 750), null); assert.match(quantityProblem(r, 250, 'Rice')!, /smallest order of Rice is 0.5 kg/); assert.match(quantityProblem(r, 600)!, /steps of 0.25 kg/)
  assert.equal(quantityProblem(r, 0), 'Invalid quantity.'); assert.equal(quantityProblem(r, 1.5), 'Invalid quantity.'); assert.equal(quantityProblem(r, MAX_BASE_QUANTITY + 1), 'Invalid quantity.')
  assert.equal(isBuyable(quantityRule(rice, 400, 10)), false); assert.equal(isBuyable(r), true)
  assert.equal(quantityRule(rice, null, 10).max, MAX_BASE_QUANTITY)
  assert.deepEqual(quantityRule({ type: 'MEASURABLE', unitCode: 'g', qtyMin: null, qtyStep: null }, null, 10), { unit: 'g', measured: true, min: 1, step: 1, max: MAX_BASE_QUANTITY })
})

test('counted rule: whole numbers, store cap and stock', () => {
  const r = quantityRule({ type: 'SIMPLE', unitCode: 'box', qtyMin: null, qtyStep: null }, 4, 10)
  assert.deepEqual(r, { unit: 'box', measured: false, min: 1, step: 1, max: 4 })
  assert.equal(quantityProblem(r, 4), null); assert.match(quantityProblem(r, 5, 'Soap')!, /at most 4 of Soap/)
  assert.equal(snapQuantity(r, 9), 4); assert.equal(snapQuantity(r, 0), 1)
  assert.equal(isBuyable(quantityRule({ type: 'VARIANTS', unitCode: null, qtyMin: null, qtyStep: null }, 0, 10)), false)
  assert.equal(quantityRule({ type: 'VARIANTS', unitCode: null, qtyMin: null, qtyStep: null }, null, 10).max, 10)
  // a measured-looking unit on a non-measurable product is ignored (cannot sneak decimals into a counted product)
  assert.equal(quantityRule({ type: 'SIMPLE', unitCode: 'kg', qtyMin: 500, qtyStep: 250 }, 9, 10).measured, false)
})

const groups = (s: string) => { const r = parseOptionGroups(s); assert.ok(r.ok, s); return r.ok ? r.value : [] }

test('options: parse, de-duplicate, limits and readable errors', () => {
  assert.deepEqual(groups('Size: S, M, L\nColour: Red, Blue'), [{ name: 'Size', values: ['S', 'M', 'L'] }, { name: 'Colour', values: ['Red', 'Blue'] }])
  assert.deepEqual(groups('  size :  S ,s, M,, '), [{ name: 'size', values: ['S', 'M'] }])
  assert.deepEqual(groups(''), []); assert.deepEqual(groups('\n \n'), [])
  const bad: [string, RegExp][] = [
    ['Size S M', /write it like/], ['Size:', /at least one value/], ['A: 1\nB: 2\nC: 3\nD: 4', /at most 3 options/], ['Size: S\nsize: M', /twice/],
    ['X'.repeat(21) + ': a', /20 characters/], ['Size: ' + 'y'.repeat(31), /30 characters/],
    ['A: ' + Array.from({ length: 31 }, (_, i) => `v${i}`).join(','), /at most 30 values/],
    ['A: ' + Array.from({ length: 11 }, (_, i) => `a${i}`).join(',') + '\nB: ' + Array.from({ length: 10 }, (_, i) => `b${i}`).join(','), /110 variants/],
  ]
  for (const [raw, re] of bad) { const r = parseOptionGroups(raw); assert.ok(!r.ok, raw.slice(0, 20)); if (!r.ok) assert.match(r.error, re) }
  assert.equal(optionGroupsToText(groups('Size: S, M\nColour: Red')), 'Size: S, M\nColour: Red')
})

test('combinations, labels, keys and stored-JSON reading', () => {
  const g = groups('Size: S, M\nColour: Red, Blue')
  const c = combinations(g)
  assert.equal(c.length, 4); assert.deepEqual(c.map((x) => variantLabel(x, g)), ['S / Red', 'S / Blue', 'M / Red', 'M / Blue'])
  assert.deepEqual(combinations([]), [])
  assert.equal(comboKey({ Size: 'M', Colour: 'Red' }), comboKey({ colour: 'red', size: 'm' }))
  assert.deepEqual(readOptionGroups([{ name: 'Size', values: ['S', 3] }, { name: '', values: ['x'] }, null, { name: 'C' }]), [{ name: 'Size', values: ['S'] }])
  assert.deepEqual(readOptionGroups('junk'), []); assert.equal(readOptionValues(['x']), null); assert.equal(readOptionValues({}), null); assert.deepEqual(readOptionValues({ Size: 'M', n: 1 }), { Size: 'M' })
})

test('generation plan: add missing, switch off removed, revive returned, never touch hand-made variants', () => {
  const g = groups('Size: S, M\nColour: Red')
  const ex: ExistingVariant[] = [
    { id: 'a', optionValues: { Size: 'S', Colour: 'Red' }, isActive: true },
    { id: 'b', optionValues: { Size: 'XL', Colour: 'Red' }, isActive: true }, // no longer wanted
    { id: 'c', optionValues: { size: 'm', colour: 'red' }, isActive: false }, // wanted again (different case)
    { id: 'h', optionValues: null, isActive: true }, // made by hand
  ]
  const p = planGeneration(g, ex)
  assert.deepEqual(p.create, []); assert.deepEqual(p.deactivate, ['b']); assert.deepEqual(p.reactivate, ['c']); assert.equal(p.keep, 2)
  const fresh = planGeneration(g, [])
  assert.deepEqual(fresh.create.map((x) => x.label), ['S / Red', 'M / Red'])
  assert.deepEqual(planGeneration([], ex).deactivate, ['a', 'b']) // removing every option switches the generated ones off, still keeps the hand-made one
})

test('SKUs: readable, safe characters, unique', () => {
  const g = groups('Size: Medium, Large\nColour: Dark Red')
  assert.equal(skuFor('T-Shirt', { Size: 'Medium', Colour: 'Dark Red' }, g, new Set()), 'TSHIRT-MEDIUM-DARKRE')
  assert.equal(skuFor('T-Shirt', { Size: 'Medium', Colour: 'Dark Red' }, g, new Set(['TSHIRT-MEDIUM-DARKRE'])), 'TSHIRT-MEDIUM-DARKRE-2')
  assert.equal(skuFor('!!!', { Size: 'S' }, groups('Size: S'), new Set()), 'SKU-S')
  assert.match(skuFor('x'.repeat(40), { Size: 'Medium', Colour: 'Dark Red' }, g, new Set()), /^[A-Z0-9-]{1,30}$/)
  assert.ok(getUnit('kg'))
})
