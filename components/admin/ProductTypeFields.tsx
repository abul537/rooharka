'use client'

import { useState } from 'react'
import { COUNT_UNITS, DIMENSION_LABEL, getUnit, unitsOf, type Dimension } from '@/lib/units/registry'
import { Field, inputCls } from '@/components/admin/ui'

type Kind = 'SIMPLE' | 'VARIANTS' | 'MEASURABLE'
const KINDS: { value: Kind; title: string; text: string }[] = [
  { value: 'SIMPLE', title: 'Simple product', text: 'One item you count in pieces, boxes or bags. One SKU, one stock number.' },
  { value: 'VARIANTS', title: 'With variants', text: 'Sizes, colours or capacities. Every combination gets its own SKU, price and stock, built automatically.' },
  { value: 'MEASURABLE', title: 'Measurable', text: 'Sold by weight, volume or length (kg, g, litres, mL, metres). Customers choose how much.' },
]

/** The "how is it sold" part of the Add product form: the fields change with the chosen type. */
export default function ProductTypeFields() {
  const [type, setType] = useState<Kind>('SIMPLE')
  const [measureUnit, setMeasureUnit] = useState('kg')
  const u = getUnit(measureUnit)!
  const measured = type === 'MEASURABLE'

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="text-sm font-medium mb-2">How is this product sold?</legend>
        <div className="grid sm:grid-cols-3 gap-3">
          {KINDS.map((k) => (
            <label key={k.value} className={`rounded-lg border-2 p-3 cursor-pointer text-sm ${type === k.value ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
              <input type="radio" name="type" value={k.value} checked={type === k.value} onChange={() => setType(k.value)} className="sr-only" />
              <span className="block font-semibold">{k.title}</span><span className="block text-slate-600 mt-1">{k.text}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {measured ? (
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Sold by" hint="The price is per one of this unit. It cannot be changed later.">
            <select name="unitCode" value={measureUnit} onChange={(e) => setMeasureUnit(e.target.value)} className={inputCls}>
              {(['MASS', 'VOLUME', 'LENGTH'] as Dimension[]).map((d) => <optgroup key={d} label={DIMENSION_LABEL[d]}>{unitsOf(d).map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}</optgroup>)}
            </select>
          </Field>
          <Field label={`Smallest order (${u.code})`} hint="e.g. 0.5"><input key={`min${u.code}`} name="qtyMin" inputMode="decimal" defaultValue={u.defaultStep} className={inputCls} /></Field>
          <Field label={`Order step (${u.code})`} hint="Customers add this much at a time"><input key={`step${u.code}`} name="qtyStep" inputMode="decimal" defaultValue={u.defaultStep} className={inputCls} /></Field>
        </div>
      ) : (
        <Field label="Counted in" hint="Stock and orders are whole numbers of this unit.">
          <select name="unitCode" defaultValue="piece" className={inputCls}>{COUNT_UNITS.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}</select>
        </Field>
      )}

      {type === 'VARIANTS' && (
        <Field label="Options" hint="One per line: “Size: S, M, L” then “Colour: Red, Blue”. Every combination becomes a variant. Leave empty to start with a single variant and add more later.">
          <textarea name="options" rows={3} placeholder={'Size: S, M, L\nColour: Red, Blue'} className={`${inputCls} font-mono`} />
        </Field>
      )}

      <div className="grid sm:grid-cols-4 gap-3">
        {type === 'VARIANTS' && <Field label="Name (only if no options)" hint="e.g. 100ml"><input name="v_label" maxLength={40} className={inputCls} /></Field>}
        <Field label={measured ? `Price (Rs. per ${u.code})` : type === 'VARIANTS' ? 'Price for every variant (Rs.)' : 'Price (Rs.)'}><input name="v_price" required inputMode={measured ? 'decimal' : 'numeric'} className={inputCls} /></Field>
        <Field label="Crossed-out price"><input name="v_compareAt" inputMode={measured ? 'decimal' : 'numeric'} className={inputCls} /></Field>
        <Field label={measured ? `In stock (${u.code})` : type === 'VARIANTS' ? 'Stock for each variant' : 'In stock'} hint={measured ? 'e.g. 25 or 12.5' : undefined}><input name="v_stock" inputMode={measured ? 'decimal' : 'numeric'} defaultValue="0" className={inputCls} /></Field>
      </div>
      {type === 'VARIANTS' && <p className="text-xs text-slate-500">You can change the price and stock of each variant separately after creating the product.</p>}
    </div>
  )
}
